import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
import { logger } from "../../utils/logger.js";
import type {
  IStorage,
  StoredUser,
  StoredStreamer,
  StoredStreamEvent,
  StoredSubscription,
  StreamerWithRelations,
  EventWithStreamer,
  StreamerFilters,
  PaginationOptions,
  PaginatedResult,
  EventFilters,
} from "./interface.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "..", "data");
const STREAMERS_FILE = join(DATA_DIR, "streamers.json");
const EVENTS_FILE = join(DATA_DIR, "events.json");
const USERS_FILE = join(DATA_DIR, "users.json");
const SUBSCRIPTIONS_FILE = join(DATA_DIR, "subscriptions.json");

/**
 * Generate a unique ID (similar to cuid)
 */
function generateId(): string {
  return `dev_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
}

/**
 * JSON file-based storage for development mode.
 *
 * Stores data in /data/*.json files.
 * NOT suitable for production — no concurrency, no indices, no transactions.
 */
export class JsonStorage implements IStorage {
  private users: StoredUser[] = [];
  private streamers: StoredStreamer[] = [];
  private events: StoredStreamEvent[] = [];
  private subscriptions: StoredSubscription[] = [];

  async init(): Promise<void> {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }

    this.users = this.loadFile<StoredUser[]>(USERS_FILE, []);
    this.streamers = this.loadFile<StoredStreamer[]>(STREAMERS_FILE, []);
    this.events = this.loadFile<StoredStreamEvent[]>(EVENTS_FILE, []);
    this.subscriptions = this.loadFile<StoredSubscription[]>(SUBSCRIPTIONS_FILE, []);

    // In development, reset all isLive to false and clear lastCheckedAt
    // so the scheduler re-detects live status and fires events on restart
    if (process.env.NODE_ENV !== "production") {
      for (const s of this.streamers) {
        s.isLive = false;
        s.lastCheckedAt = null;
      }
      this.saveStreamers();
      logger.info("[JsonStorage] Dev mode: reset all streamers to offline for fresh detection");
    }

    logger.info(
      `[JsonStorage] Loaded ${this.streamers.length} streamers, ${this.events.length} events, ${this.users.length} users, ${this.subscriptions.length} subscriptions`,
    );
  }

  async close(): Promise<void> {
    this.flush();
    logger.info("[JsonStorage] Flushed and closed");
  }

  // ─── Users ───

  async findUser(id: string): Promise<StoredUser | null> {
    return this.users.find((u) => u.id === id) ?? null;
  }

  async createUser(id: string, email?: string): Promise<StoredUser> {
    const user: StoredUser = {
      id,
      email: email ?? null,
      createdAt: new Date().toISOString(),
    };
    this.users.push(user);
    this.saveUsers();
    return user;
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
    const streamer: StoredStreamer = {
      id: generateId(),
      platform: data.platform,
      username: data.username,
      displayName: data.displayName ?? null,
      isLive: data.isLive ?? false,
      lastLiveAt: data.lastLiveAt?.toISOString() ?? null,
      lastCheckedAt: data.lastCheckedAt?.toISOString() ?? null,
      checkInterval: 300,
      priorityScore: 0,
      inactiveDays: 0,
      isArchived: false,
      userId: data.userId,
      createdAt: new Date().toISOString(),
    };
    this.streamers.push(streamer);
    this.saveStreamers();
    return streamer;
  }

  async findStreamerByUnique(
    platform: string,
    username: string,
    userId: string,
  ): Promise<StoredStreamer | null> {
    return (
      this.streamers.find(
        (s) =>
          s.platform === platform &&
          s.username === username &&
          s.userId === userId,
      ) ?? null
    );
  }

  async findStreamerById(id: string): Promise<StreamerWithRelations | null> {
    const streamer = this.streamers.find((s) => s.id === id);
    if (!streamer) return null;

    const events = this.events
      .filter((e) => e.streamerId === id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);

    const user = this.users.find((u) => u.id === streamer.userId);
    const eventCount = this.events.filter((e) => e.streamerId === id).length;
    const subs = this.subscriptions.filter((s) => s.streamerId === id);

    return {
      ...streamer,
      events,
      subscriptions: subs,
      user: user ?? undefined,
      _count: { events: eventCount, subscriptions: subs.length },
    };
  }

  async findStreamers(
    filters: StreamerFilters,
    pagination: PaginationOptions,
  ): Promise<PaginatedResult<StoredStreamer>> {
    let result = [...this.streamers];

    // Apply filters
    if (filters.platform) {
      result = result.filter((s) => s.platform === filters.platform);
    }
    if (filters.isLive !== undefined) {
      result = result.filter((s) => s.isLive === filters.isLive);
    }
    if (filters.userId) {
      result = result.filter((s) => s.userId === filters.userId);
    }
    if (filters.isArchived !== undefined) {
      result = result.filter((s) => s.isArchived === filters.isArchived);
    }

    // Sort: priorityScore desc, then lastLiveAt desc
    result.sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      const aTime = a.lastLiveAt ? new Date(a.lastLiveAt).getTime() : 0;
      const bTime = b.lastLiveAt ? new Date(b.lastLiveAt).getTime() : 0;
      return bTime - aTime;
    });

    const total = result.length;
    const skip = (pagination.page - 1) * pagination.limit;
    const items = result.slice(skip, skip + pagination.limit);

    return {
      items,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  async findAllActiveStreamers(): Promise<StoredStreamer[]> {
    return this.streamers.filter((s) => !s.isArchived);
  }

  async updateStreamer(id: string, data: Partial<StoredStreamer>): Promise<void> {
    const index = this.streamers.findIndex((s) => s.id === id);
    if (index === -1) return;

    this.streamers[index] = { ...this.streamers[index], ...data };
    this.saveStreamers();
  }

  async deleteStreamer(id: string): Promise<void> {
    this.streamers = this.streamers.filter((s) => s.id !== id);
    this.events = this.events.filter((e) => e.streamerId !== id);
    this.subscriptions = this.subscriptions.filter((s) => s.streamerId !== id);
    this.saveStreamers();
    this.saveEvents();
    this.saveSubscriptions();
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
    const event: StoredStreamEvent = {
      id: generateId(),
      streamerId: data.streamerId,
      title: data.title ?? null,
      thumbnail: data.thumbnail ?? null,
      profileImage: data.profileImage ?? null,
      url: data.url ?? null,
      notifiedGuilds: [],
      startedAt: data.startedAt.toISOString(),
      createdAt: new Date().toISOString(),
    };
    this.events.push(event);
    this.saveEvents();
    return event;
  }

  async findEvents(filters: EventFilters): Promise<EventWithStreamer[]> {
    let result = [...this.events];

    if (filters.since) {
      const sinceTime = filters.since.getTime();
      result = result.filter((e) => new Date(e.createdAt).getTime() >= sinceTime);
    }
    if (filters.streamerId) {
      result = result.filter((e) => e.streamerId === filters.streamerId);
    }

    // Sort newest first
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply limit
    const limit = filters.limit ?? 50;
    result = result.slice(0, limit);

    // Attach streamer info
    return result.map((event) => {
      const streamer = this.streamers.find((s) => s.id === event.streamerId);
      return {
        ...event,
        streamer: streamer
          ? {
              id: streamer.id,
              platform: streamer.platform,
              username: streamer.username,
              displayName: streamer.displayName,
            }
          : undefined,
      };
    });
  }

  // ─── Internal helpers ───

  async markEventNotified(eventId: string, guildId: string): Promise<void> {
    const event = this.events.find((e) => e.id === eventId);
    if (!event) return;
    if (!event.notifiedGuilds) event.notifiedGuilds = [];
    if (!event.notifiedGuilds.includes(guildId)) {
      event.notifiedGuilds.push(guildId);
      this.saveEvents();
    }
  }

  private loadFile<T>(filepath: string, fallback: T): T {
    if (existsSync(filepath)) {
      try {
        const data = readFileSync(filepath, "utf-8");
        return JSON.parse(data) as T;
      } catch (error) {
        logger.error(`Failed to load ${filepath}:`, error);
        return fallback;
      }
    }
    return fallback;
  }

  private saveStreamers(): void {
    this.writeFile(STREAMERS_FILE, this.streamers);
  }

  private saveEvents(): void {
    this.writeFile(EVENTS_FILE, this.events);
  }

  private saveUsers(): void {
    this.writeFile(USERS_FILE, this.users);
  }

  private saveSubscriptions(): void {
    this.writeFile(SUBSCRIPTIONS_FILE, this.subscriptions);
  }

  private flush(): void {
    this.saveStreamers();
    this.saveEvents();
    this.saveUsers();
    this.saveSubscriptions();
  }

  private writeFile(filepath: string, data: unknown): void {
    try {
      writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      logger.error(`Failed to write ${filepath}:`, error);
    }
  }

  // ─── Subscriptions ───

  async createSubscription(data: {
    streamerId: string;
    guildId: string;
    channelId: string;
    mentionRoleId?: string | null;
  }): Promise<StoredSubscription> {
    const sub: StoredSubscription = {
      id: generateId(),
      streamerId: data.streamerId,
      guildId: data.guildId,
      channelId: data.channelId,
      mentionRoleId: data.mentionRoleId ?? null,
      createdAt: new Date().toISOString(),
    };
    this.subscriptions.push(sub);
    this.saveSubscriptions();
    return sub;
  }

  async findSubscriptionsByGuild(guildId: string): Promise<(StoredSubscription & { streamer?: { id: string; platform: string; username: string; displayName: string | null } })[]> {
    const subs = this.subscriptions.filter((s) => s.guildId === guildId);
    return subs.map((s) => {
      const streamer = this.streamers.find((st) => st.id === s.streamerId);
      return {
        ...s,
        streamer: streamer
          ? { id: streamer.id, platform: streamer.platform, username: streamer.username, displayName: streamer.displayName }
          : undefined,
      };
    });
  }

  async findSubscriptionsByStreamer(streamerId: string): Promise<StoredSubscription[]> {
    return this.subscriptions.filter((s) => s.streamerId === streamerId);
  }

  async findSubscriptionById(id: string): Promise<StoredSubscription | null> {
    return this.subscriptions.find((s) => s.id === id) ?? null;
  }

  async deleteSubscription(id: string): Promise<void> {
    this.subscriptions = this.subscriptions.filter((s) => s.id !== id);
    this.saveSubscriptions();
  }
}
