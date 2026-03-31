/**
 * Storage interface types
 *
 * These types mirror the Prisma models but are decoupled from Prisma
 * so the JSON storage can use them too.
 */

export interface StoredUser {
  id: string;
  email: string | null;
  createdAt: string; // ISO timestamp
}

export interface StoredStreamer {
  id: string;
  platform: string;
  username: string;
  displayName: string | null;
  isLive: boolean;
  lastLiveAt: string | null;     // ISO timestamp
  lastCheckedAt: string | null;  // ISO timestamp
  checkInterval: number;
  priorityScore: number;
  inactiveDays: number;
  isArchived: boolean;
  userId: string;
  createdAt: string;             // ISO timestamp
}

export interface StoredStreamEvent {
  id: string;
  streamerId: string;
  title: string | null;
  thumbnail: string | null;
  profileImage: string | null;
  url: string | null;
  notifiedGuilds: string[];
  startedAt: string;   // ISO timestamp
  createdAt: string;    // ISO timestamp
}

export interface StoredSubscription {
  id: string;
  streamerId: string;
  guildId: string;
  channelId: string;
  mentionRoleId: string | null;
  createdAt: string;    // ISO timestamp
}

/**
 * Streamer with related data for detail endpoints
 */
export interface StreamerWithRelations extends StoredStreamer {
  events?: StoredStreamEvent[];
  subscriptions?: StoredSubscription[];
  user?: StoredUser;
  _count?: { events: number; subscriptions: number };
}

/**
 * Event with streamer info
 */
export interface EventWithStreamer extends StoredStreamEvent {
  streamer?: {
    id: string;
    platform: string;
    username: string;
    displayName: string | null;
  };
}

/**
 * Filters for listing streamers
 */
export interface StreamerFilters {
  platform?: string;
  isLive?: boolean;
  userId?: string;
  isArchived?: boolean;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  page: number;
  limit: number;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Event filters
 */
export interface EventFilters {
  since?: Date;
  streamerId?: string;
  limit?: number;
}

/**
 * Storage interface - abstraction over JSON file and Prisma storage
 */
export interface IStorage {
  /** Initialize the storage (create files, connect DB, etc.) */
  init(): Promise<void>;

  /** Cleanup (disconnect, flush, etc.) */
  close(): Promise<void>;

  // ─── Users ───
  findUser(id: string): Promise<StoredUser | null>;
  createUser(id: string, email?: string): Promise<StoredUser>;

  // ─── Streamers ───
  createStreamer(data: {
    platform: string;
    username: string;
    displayName?: string | null;
    userId: string;
    isLive?: boolean;
    lastLiveAt?: Date | null;
    lastCheckedAt?: Date | null;
  }): Promise<StoredStreamer>;

  findStreamerByUnique(platform: string, username: string, userId: string): Promise<StoredStreamer | null>;
  findStreamerById(id: string): Promise<StreamerWithRelations | null>;
  findStreamers(filters: StreamerFilters, pagination: PaginationOptions): Promise<PaginatedResult<StoredStreamer>>;
  findAllActiveStreamers(): Promise<StoredStreamer[]>;

  updateStreamer(id: string, data: Partial<StoredStreamer>): Promise<void>;
  deleteStreamer(id: string): Promise<void>;

  // ─── Events ───
  createEvent(data: {
    streamerId: string;
    title?: string | null;
    thumbnail?: string | null;
    profileImage?: string | null;
    url?: string | null;
    startedAt: Date;
  }): Promise<StoredStreamEvent>;

  findEvents(filters: EventFilters): Promise<EventWithStreamer[]>;

  markEventNotified(eventId: string, guildId: string): Promise<void>;

  // ─── Subscriptions ───
  createSubscription(data: {
    streamerId: string;
    guildId: string;
    channelId: string;
    mentionRoleId?: string | null;
  }): Promise<StoredSubscription>;

  findSubscriptionsByGuild(guildId: string): Promise<(StoredSubscription & { streamer?: { id: string; platform: string; username: string; displayName: string | null } })[]>;
  findSubscriptionsByStreamer(streamerId: string): Promise<StoredSubscription[]>;
  findSubscriptionById(id: string): Promise<StoredSubscription | null>;
  deleteSubscription(id: string): Promise<void>;
}
