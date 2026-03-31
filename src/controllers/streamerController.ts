import type { Request, Response } from "express";
import { getStorage } from "../services/storage/index.js";
import { getChecker } from "../services/scraper/index.js";
import { logger } from "../utils/logger.js";

/**
 * POST /streamers
 *
 * Add a new streamer to track.
 * Body: { platform, username, userId, displayName? }
 */
export async function createStreamer(
  req: Request,
  res: Response,
): Promise<void> {
  const storage = getStorage();
  const { platform, username, userId, displayName } = req.body;

  try {
    // Ensure user exists
    let user = await storage.findUser(userId);
    if (!user) {
      user = await storage.createUser(userId);
    }

    // Check for duplicates
    const existing = await storage.findStreamerByUnique(platform, username, userId);

    if (existing) {
      res.status(409).json({
        error: "Streamer already tracked",
        streamer: existing,
      });
      return;
    }

    // Optionally verify the streamer exists on the platform
    const checker = getChecker(platform);
    let initialData: {
      isLive?: boolean;
      lastLiveAt?: Date | null;
      lastCheckedAt?: Date | null;
    } = {};

    if (checker) {
      try {
        const result = await checker(username);
        // Always start with isLive=false so the scheduler detects
        // the offline→live transition and creates an event/notification
        initialData = {
          isLive: false,
          lastLiveAt: null,
          lastCheckedAt: null,
        };
      } catch {
        logger.warn(`Could not verify ${platform}:${username}, creating anyway`);
      }
    }

    const streamer = await storage.createStreamer({
      platform,
      username,
      displayName: displayName ?? null,
      userId,
      ...initialData,
    });

    logger.info(`Created streamer: ${platform}:${username} for user ${userId}`);

    res.status(201).json({ streamer });
  } catch (error) {
    logger.error("Error creating streamer:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /streamers
 *
 * List all streamers with optional filters.
 * Query: ?platform=twitch&live=true&userId=xxx&page=1&limit=50
 */
export async function getStreamers(
  req: Request,
  res: Response,
): Promise<void> {
  const storage = getStorage();
  const { platform, live, userId, page, limit } = req.query;

  try {
    const filters: {
      platform?: string;
      isLive?: boolean;
      userId?: string;
      isArchived?: boolean;
    } = { isArchived: false };

    if (platform && typeof platform === "string") {
      filters.platform = platform.toLowerCase();
    }
    if (live === "true") {
      filters.isLive = true;
    } else if (live === "false") {
      filters.isLive = false;
    }
    if (userId && typeof userId === "string") {
      filters.userId = userId;
    }

    const pageNum = Math.max(1, parseInt(String(page ?? "1"), 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit ?? "50"), 10) || 50));

    const result = await storage.findStreamers(filters, {
      page: pageNum,
      limit: limitNum,
    });

    res.json({
      streamers: result.items,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    logger.error("Error fetching streamers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /streamers/:id
 *
 * Get a single streamer with recent events.
 */
export async function getStreamerById(
  req: Request,
  res: Response,
): Promise<void> {
  const storage = getStorage();
  const id = req.params.id as string;

  try {
    const streamer = await storage.findStreamerById(id);

    if (!streamer) {
      res.status(404).json({ error: "Streamer not found" });
      return;
    }

    res.json({ streamer });
  } catch (error) {
    logger.error("Error fetching streamer:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * DELETE /streamers/:id
 *
 * Remove a streamer.
 */
export async function deleteStreamer(
  req: Request,
  res: Response,
): Promise<void> {
  const storage = getStorage();
  const id = req.params.id as string;

  try {
    const existing = await storage.findStreamerById(id);
    if (!existing) {
      res.status(404).json({ error: "Streamer not found" });
      return;
    }

    await storage.deleteStreamer(id);

    logger.info(`Deleted streamer: ${existing.platform}:${existing.username}`);
    res.json({ message: "Streamer deleted", id });
  } catch (error) {
    logger.error("Error deleting streamer:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
