/**
 * Supported streaming platforms
 */
export type Platform = "kick" | "twitch" | "youtube" | "rumble" | "tiktok";

/**
 * Live status returned by platform checkers
 */
export interface LiveStatus {
  /** Whether the streamer is currently live */
  isLive: boolean;
  /** Platform name */
  platform: Platform;
  /** Username checked */
  username: string;
  /** Stream title */
  title?: string;
  /** Current viewer count */
  viewers?: number;
  /** Follower/subscriber count */
  followers?: number;
  /** Stream thumbnail URL */
  thumbnail?: string;
  /** Profile image URL */
  profileImage?: string;
  /** Stream start time (ISO timestamp) */
  startedAt?: string;
  /** Direct URL to the stream */
  url: string;
  /** Verified status */
  verified?: boolean;
  /** Bio/description */
  bio?: string;
  /** Stream category/game */
  category?: string;
  /** Category icon URL */
  categoryIcon?: string;
  /** Stream tags */
  tags?: string[];
  /** Stream language */
  language?: string;
  /** Whether stream is marked as mature */
  isMature?: boolean;
  /** Error message if check failed */
  error?: string;
}

/**
 * Function signature for platform checkers
 */
export type PlatformChecker = (username: string) => Promise<LiveStatus>;

/**
 * Platform configuration
 */
export interface PlatformConfig {
  /** Display name */
  name: string;
  /** Hex color */
  color: string;
  /** Platform emoji */
  emoji: string;
  /** URL template with {username} placeholder */
  urlTemplate: string;
}
