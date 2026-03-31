import type { Request, Response } from "express";
import { getStorage } from "../services/storage/index.js";
import { logger } from "../utils/logger.js";

/**
 * GET /events
 *
 * Get stream events with optional filters.
 * Query: ?since=ISO_TIMESTAMP&limit=50&streamerId=xxx
 */
export async function getEvents(
  req: Request,
  res: Response,
): Promise<void> {
  const storage = getStorage();
  const { since, limit, streamerId } = req.query;

  try {
    const filters: {
      since?: Date;
      streamerId?: string;
      limit?: number;
    } = {};

    if (since && typeof since === "string") {
      filters.since = new Date(since);
    }

    if (streamerId && typeof streamerId === "string") {
      filters.streamerId = streamerId;
    }

    filters.limit = Math.min(500, Math.max(1, parseInt(String(limit ?? "50"), 10) || 50));

    const events = await storage.findEvents(filters);

    res.json({
      events,
      count: events.length,
    });
  } catch (error) {
    logger.error("Error fetching events:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PATCH /events/:id/notify
 *
 * Mark an event as notified for a specific guild.
 * Body: { guildId: string }
 */
export async function markEventNotified(
  req: Request,
  res: Response,
): Promise<void> {
  const storage = getStorage();
  const id = req.params.id as string;
  const { guildId } = req.body;

  if (!guildId || typeof guildId !== "string") {
    res.status(400).json({ error: "guildId is required" });
    return;
  }

  try {
    await storage.markEventNotified(id, guildId);
    res.json({ ok: true });
  } catch (error) {
    logger.error(`Error marking event ${id} as notified:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
}
