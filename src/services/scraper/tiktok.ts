import { logger } from "../../utils/logger.js";
import { getRandomUserAgent, withRetry, randomDelay, type LiveCheckResult } from "./helpers.js";

/**
 * TikTok SIGI_STATE types (partial)
 */
interface TikTokSigiState {
  LiveRoom?: {
    liveRoomUserInfo?: {
      user?: {
        id: string;
        uniqueId: string;
        nickname: string;
        signature?: string;
        verified: boolean;
        avatarLarger?: string;
        avatarMedium?: string;
        avatarThumb?: string;
        roomId?: string;
        status?: number;
      };
      stats?: {
        followerCount: number;
        followingCount: number;
      };
      liveRoom?: {
        title?: string;
        startTime?: number;
        status?: number;
        coverUrl?: string;
        squareCoverImg?: string;
        liveRoomStats?: {
          userCount: number;
          enterCount: number;
        };
        hashTagId?: number;
        gameTagId?: number;
      };
    };
    liveRoomStatus?: number;
  };
}

/**
 * Check if a TikTok user is live by parsing SIGI_STATE from HTML
 */
export async function checkLive(username: string): Promise<LiveCheckResult> {
  const url = `https://www.tiktok.com/@${username}/live`;

  const baseResult: LiveCheckResult = {
    isLive: false,
    url,
  };

  return withRetry(async () => {
    await randomDelay();

    const response = await fetch(url, {
      headers: {
        "User-Agent": getRandomUserAgent(),
        "Accept-Language": "en-US,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return baseResult;
    }

    const html = await response.text();

    // Extract SIGI_STATE JSON from script tag
    const stateMatch = html.match(
      /<script[^>]*id=["']SIGI_STATE["'][^>]*>({.*?})<\/script>/s,
    );

    if (!stateMatch) {
      if (html.includes('"isLive":true') || html.includes('"liveRoom"')) {
        return { ...baseResult, isLive: true };
      }
      return baseResult;
    }

    const data: TikTokSigiState = JSON.parse(stateMatch[1]);
    const liveRoom = data.LiveRoom?.liveRoomUserInfo;

    if (!liveRoom) {
      return baseResult;
    }

    const user = liveRoom.user;
    const stats = liveRoom.stats;
    const room = liveRoom.liveRoom;

    // Check if actually live - status 2 means live
    const isLive = room?.status === 2 || data.LiveRoom?.liveRoomStatus === 2;

    if (!isLive) {
      return {
        ...baseResult,
        followers: stats?.followerCount,
        profileImage: user?.avatarLarger ?? user?.avatarMedium,
        verified: user?.verified ?? false,
        bio: user?.signature,
      };
    }

    // Extract live stream data
    const title = room?.title;
    const viewers = room?.liveRoomStats?.userCount;
    const startTime = room?.startTime
      ? new Date(room.startTime * 1000).toISOString()
      : undefined;

    const thumbnail = room?.squareCoverImg ?? room?.coverUrl ?? user?.avatarLarger ?? user?.avatarMedium;

    return {
      isLive: true,
      title,
      viewers,
      followers: stats?.followerCount,
      thumbnail,
      profileImage: user?.avatarLarger ?? user?.avatarMedium,
      startedAt: startTime,
      url,
      verified: user?.verified ?? false,
      bio: user?.signature,
    };
  }, 3, `tiktok:${username}`);
}
