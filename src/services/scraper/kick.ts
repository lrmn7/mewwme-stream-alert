import { logger } from "../../utils/logger.js";
import { cleanString } from "../../utils/formatters.js";
import { getRandomUserAgent, withRetry, randomDelay, type LiveCheckResult } from "./helpers.js";

/**
 * Kick API response types
 */
interface KickCategory {
  id: number;
  name: string;
  slug: string;
  tags: string[];
  banner?: {
    url?: string;
    responsive?: string;
  };
  category: {
    id: number;
    name: string;
    slug: string;
    icon: string;
  };
}

interface KickChannelResponse {
  id: number;
  slug: string;
  user_id: number;
  is_banned: boolean;
  playback_url: string;
  vod_enabled: boolean;
  subscription_enabled: boolean;
  followers_count: number;
  verified: boolean;
  banner_image?: {
    url: string;
  };
  offline_banner_image?: {
    src: string;
    srcset: string;
  };
  recent_categories?: KickCategory[];
  user: {
    id: number;
    username: string;
    bio: string | null;
    profile_pic: string;
    instagram: string | null;
    twitter: string | null;
    youtube: string | null;
    discord: string | null;
    tiktok: string | null;
    facebook: string | null;
  };
  livestream: {
    id: number;
    slug: string;
    channel_id: number;
    session_title: string;
    is_live: boolean;
    start_time: string;
    created_at: string;
    language: string;
    is_mature: boolean;
    viewer_count: number;
    thumbnail?: {
      url?: string;
      src?: string;
      srcset?: string;
    } | null;
    tags: string[];
    categories: KickCategory[];
  } | null;
}

/**
 * Check if a Kick streamer is live via direct API fetch
 */
export async function checkLive(username: string): Promise<LiveCheckResult> {
  const url = `https://kick.com/${username}`;
  const apiUrl = `https://kick.com/api/v2/channels/${username}`;

  const baseResult: LiveCheckResult = {
    isLive: false,
    url,
  };

  return withRetry(async () => {
    await randomDelay();

    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": getRandomUserAgent(),
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return baseResult;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as KickChannelResponse;

    if (!data) {
      return baseResult;
    }

    const category = data.livestream?.categories?.[0];
    const categoryName = category?.name;

    // Check if livestream exists and is live
    if (data.livestream?.is_live) {
      return {
        isLive: true,
        title: data.livestream.session_title ?? undefined,
        viewers: data.livestream.viewer_count ?? undefined,
        followers: data.followers_count ?? undefined,
        thumbnail: undefined, // stream.kick.com thumbnails are private/blocked
        profileImage: data.user?.profile_pic ?? undefined,
        startedAt: data.livestream.start_time ?? undefined,
        url,
        verified: data.verified ?? false,
        bio: data.user?.bio ? cleanString(data.user.bio) : undefined,
        category: categoryName,
        tags: data.livestream.tags,
        language: data.livestream.language,
      };
    }

    // Not live, but return profile data
    return {
      ...baseResult,
      followers: data.followers_count ?? undefined,
      profileImage: data.user?.profile_pic ?? undefined,
      verified: data.verified ?? false,
      bio: data.user?.bio ? cleanString(data.user.bio) : undefined,
    };
  }, 3, `kick:${username}`);
}
