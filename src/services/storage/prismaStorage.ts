import { getPrisma } from "../../prisma/client.js";
import { logger } from "../../utils/logger.js";
import type {
  IStorage,
  StoredUser,
  StoredStreamer,
  StoredStreamEvent,
  StreamerWithRelations,
  EventWithStreamer,
  StreamerFilters,
  PaginationOptions,
  PaginatedResult,
  EventFilters,
} from "./interface.js";

/** Inline type for Prisma stream event rows */
interface PrismaEventRow {
  id: string;
  streamerId: string;
  title: string | null;
  thumbnail: string | null;
  profileImage: string | null;
  url: string | null;
  startedAt: Date;
  createdAt: Date;
}

/** Inline type for Prisma subscription rows */
interface PrismaSubscriptionRow {
  id: string;
  streamerId: string;
  guildId: string;
  channelId: string;
  mentionRoleId: string | null;
  createdAt: Date;
}

/**
 * Convert a Date or null to ISO string or null
 */
function toISO(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

/**
 * Prisma-based storage for production mode.
 *
 * Full ACID compliance, indices, and concurrent access support.
 */
export class PrismaStorage implements IStorage {
  async init(): Promise<void> {
    const prisma = getPrisma();
    await prisma.$connect();
    logger.info("[PrismaStorage] Connected to database");
  }

  async close(): Promise<void> {
    const prisma = getPrisma();
    await prisma.$disconnect();
    logger.info("[PrismaStorage] Disconnected from database");
  }

  // ─── Users ───

  async findUser(id: string): Promise<StoredUser | null> {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async createUser(id: string, email?: string): Promise<StoredUser> {
    const prisma = getPrisma();
    const user = await prisma.user.create({
      data: { id, email: email ?? null },
    });
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    };
  }

  // ─── Streamers ───

  async createStreamer(data: {
    platform: string;
    username: string;
    displayName?: string | null;
    userId: string;
    isLive?: boolean;
    lastLiveAt?: Date | null;
    lastCheckedAt?: Date | null;
  }): Promise<StoredStreamer> {
    const prisma = getPrisma();
    const streamer = await prisma.streamer.create({
      data: {
        platform: data.platform,
        username: data.username,
        displayName: data.displayName ?? null,
        userId: data.userId,
        isLive: data.isLive ?? false,
        lastLiveAt: data.lastLiveAt ?? null,
        lastCheckedAt: data.lastCheckedAt ?? null,
      },
    });
    return this.mapStreamer(streamer);
  }

  async findStreamerByUnique(
    platform: string,
    username: string,
    userId: string,
  ): Promise<StoredStreamer | null> {
    const prisma = getPrisma();
    const streamer = await prisma.streamer.findUnique({
      where: { platform_username_userId: { platform, username, userId } },
    });
    return streamer ? this.mapStreamer(streamer) : null;
  }

  async findStreamerById(id: string): Promise<StreamerWithRelations | null> {
    const prisma = getPrisma();
    const streamer = await prisma.streamer.findUnique({
      where: { id },
      include: {
        events: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        subscriptions: true,
        user: {
          select: { id: true, email: true, createdAt: true },
        },
        _count: {
          select: { events: true, subscriptions: true },
        },
      },
    });

    if (!streamer) return null;

    return {
      ...this.mapStreamer(streamer),
      events: streamer.events.map((e: PrismaEventRow) => ({
        id: e.id,
        streamerId: e.streamerId,
        title: e.title,
        thumbnail: e.thumbnail,
        profileImage: e.profileImage,
        url: e.url,
        startedAt: e.startedAt.toISOString(),
        createdAt: e.createdAt.toISOString(),
      })),
      subscriptions: streamer.subscriptions.map((s: PrismaSubscriptionRow) => ({
        id: s.id,
        streamerId: s.streamerId,
        guildId: s.guildId,
        channelId: s.channelId,
        mentionRoleId: s.mentionRoleId ?? null,
        createdAt: s.createdAt.toISOString(),
      })),
      user: {
        id: streamer.user.id,
        email: streamer.user.email,
        createdAt: streamer.user.createdAt.toISOString(),
      },
      _count: streamer._count,
    };
  }

  async findStreamers(
    filters: StreamerFilters,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<StoredStreamer>> {
    const prisma = getPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (filters.platform) where.platform = filters.platform;
    if (filters.isLive !== undefined) where.isLive = filters.isLive;
    if (filters.userId) where.userId = filters.userId;
    if (filters.isArchived !== undefined) where.isArchived = filters.isArchived;

    const skip = (pagination.page - 1) * pagination.limit;

    const [streamers, total] = await Promise.all([
      prisma.streamer.findMany({
        where,
        skip,
        take: pagination.limit,
        orderBy: [
          { priorityScore: "desc" },
          { lastLiveAt: "desc" },
        ],
      }),
      prisma.streamer.count({ where }),
    ]);

    return {
      items: streamers.map((s: Parameters<typeof this.mapStreamer>[0]) => this.mapStreamer(s)),
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  async findAllActiveStreamers(): Promise<StoredStreamer[]> {
    const prisma = getPrisma();
    const streamers = await prisma.streamer.findMany({
      where: { isArchived: false },
    });
    return streamers.map((s: Parameters<typeof this.mapStreamer>[0]) => this.mapStreamer(s));
  }

  async updateStreamer(id: string, data: Partial<StoredStreamer>): Promise<void> {
    const prisma = getPrisma();
    // Convert ISO string dates back to Date objects for Prisma
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaData: any = { ...data };
    if (data.lastLiveAt !== undefined) {
      prismaData.lastLiveAt = data.lastLiveAt ? new Date(data.lastLiveAt) : null;
    }
    if (data.lastCheckedAt !== undefined) {
      prismaData.lastCheckedAt = data.lastCheckedAt ? new Date(data.lastCheckedAt) : null;
    }
    // Don't pass id in update data
    delete prismaData.id;
    delete prismaData.createdAt;

    await prisma.streamer.update({ where: { id }, data: prismaData });
  }

  async deleteStreamer(id: string): Promise<void> {
    const prisma = getPrisma();
    await prisma.streamer.delete({ where: { id } });
  }

  // ─── Events ───

  async createEvent(data: {
    streamerId: string;
    title?: string | null;
    thumbnail?: string | null;
    profileImage?: string | null;
    url?: string | null;
    startedAt: Date;
  }): Promise<StoredStreamEvent> {
    const prisma = getPrisma();
    const event = await prisma.streamEvent.create({
      data: {
        streamerId: data.streamerId,
        title: data.title ?? null,
        thumbnail: data.thumbnail ?? null,
        profileImage: data.profileImage ?? null,
        url: data.url ?? null,
        startedAt: data.startedAt,
      },
    });
    return {
      id: event.id,
      streamerId: event.streamerId,
      title: event.title,
      thumbnail: event.thumbnail,
      profileImage: event.profileImage,
      url: event.url,
      notifiedGuilds: Array.isArray(event.notifiedGuilds) ? (event.notifiedGuilds as string[]) : [],
      startedAt: event.startedAt.toISOString(),
      createdAt: event.createdAt.toISOString(),
    };
  }

  async findEvents(filters: EventFilters): Promise<EventWithStreamer[]> {
    const prisma = getPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (filters.since) {
      where.createdAt = { gte: filters.since };
    }
    if (filters.streamerId) {
      where.streamerId = filters.streamerId;
    }

    const events = await prisma.streamEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters.limit ?? 50,
      include: {
        streamer: {
          select: {
            id: true,
            platform: true,
            username: true,
            displayName: true,
          },
        },
      },
    });

    return events.map((e: { id: string; streamerId: string; title: string | null; thumbnail: string | null; profileImage: string | null; url: string | null; notifiedGuilds: unknown; startedAt: Date; createdAt: Date; streamer: { id: string; platform: string; username: string; displayName: string | null } }) => ({
      id: e.id,
      streamerId: e.streamerId,
      title: e.title,
      thumbnail: e.thumbnail,
      profileImage: e.profileImage,
      url: e.url,
      notifiedGuilds: Array.isArray(e.notifiedGuilds) ? (e.notifiedGuilds as string[]) : [],
      startedAt: e.startedAt.toISOString(),
      createdAt: e.createdAt.toISOString(),
      streamer: {
        id: e.streamer.id,
        platform: e.streamer.platform,
        username: e.streamer.username,
        displayName: e.streamer.displayName,
      },
    }));
  }

  async markEventNotified(eventId: string, guildId: string): Promise<void> {
    const prisma = getPrisma();
    const event = await prisma.streamEvent.findUnique({ where: { id: eventId } });
    if (!event) return;
    const current = Array.isArray(event.notifiedGuilds) ? (event.notifiedGuilds as string[]) : [];
    if (current.includes(guildId)) return;
    await prisma.streamEvent.update({
      where: { id: eventId },
      data: { notifiedGuilds: [...current, guildId] },
    });
  }

  // ─── Helpers ───

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapStreamer(s: any): StoredStreamer {
    return {
      id: s.id,
      platform: s.platform,
      username: s.username,
      displayName: s.displayName,
      isLive: s.isLive,
      lastLiveAt: toISO(s.lastLiveAt),
      lastCheckedAt: toISO(s.lastCheckedAt),
      checkInterval: s.checkInterval,
      priorityScore: s.priorityScore,
      inactiveDays: s.inactiveDays,
      isArchived: s.isArchived,
      userId: s.userId,
      createdAt: typeof s.createdAt === "string" ? s.createdAt : s.createdAt.toISOString(),
    };
  }

  // ─── Subscriptions ───

  async createSubscription(data: {
    streamerId: string;
    guildId: string;
    channelId: string;
    mentionRoleId?: string | null;
  }): Promise<import("./interface.js").StoredSubscription> {
    const prisma = getPrisma();
    const sub = await prisma.subscription.create({
      data: {
        streamerId: data.streamerId,
        guildId: data.guildId,
        channelId: data.channelId,
        mentionRoleId: data.mentionRoleId ?? null,
      },
    });
    return {
      id: sub.id,
      streamerId: sub.streamerId,
      guildId: sub.guildId,
      channelId: sub.channelId,
      mentionRoleId: sub.mentionRoleId,
      createdAt: sub.createdAt.toISOString(),
    };
  }

  async findSubscriptionsByGuild(guildId: string): Promise<(import("./interface.js").StoredSubscription & { streamer?: { id: string; platform: string; username: string; displayName: string | null } })[]> {
    const prisma = getPrisma();
    const subs = await prisma.subscription.findMany({
      where: { guildId },
      include: {
        streamer: {
          select: { id: true, platform: true, username: true, displayName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return subs.map((s: PrismaSubscriptionRow & { streamer: { id: string; platform: string; username: string; displayName: string | null } }) => ({
      id: s.id,
      streamerId: s.streamerId,
      guildId: s.guildId,
      channelId: s.channelId,
      mentionRoleId: s.mentionRoleId ?? null,
      createdAt: s.createdAt.toISOString(),
      streamer: {
        id: s.streamer.id,
        platform: s.streamer.platform,
        username: s.streamer.username,
        displayName: s.streamer.displayName,
      },
    }));
  }

  async findSubscriptionsByStreamer(streamerId: string): Promise<import("./interface.js").StoredSubscription[]> {
    const prisma = getPrisma();
    const subs = await prisma.subscription.findMany({
      where: { streamerId },
      orderBy: { createdAt: "desc" },
    });
    return subs.map((s: PrismaSubscriptionRow) => ({
      id: s.id,
      streamerId: s.streamerId,
      guildId: s.guildId,
      channelId: s.channelId,
      mentionRoleId: s.mentionRoleId ?? null,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  async findSubscriptionById(id: string): Promise<import("./interface.js").StoredSubscription | null> {
    const prisma = getPrisma();
    const sub = await prisma.subscription.findUnique({ where: { id } });
    if (!sub) return null;
    return {
      id: sub.id,
      streamerId: sub.streamerId,
      guildId: sub.guildId,
      channelId: sub.channelId,
      mentionRoleId: sub.mentionRoleId ?? null,
      createdAt: sub.createdAt.toISOString(),
    };
  }

  async deleteSubscription(id: string): Promise<void> {
    const prisma = getPrisma();
    await prisma.subscription.delete({ where: { id } });
  }
}
