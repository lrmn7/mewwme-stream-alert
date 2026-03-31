import type { Request, Response } from "express";
import { getStorage } from "../services/storage/index.js";
import { logger } from "../utils/logger.js";

/**
 * POST /subscriptions
 *
 * Create a subscription linking a streamer to a Discord guild channel.
 * Body: { streamerId, guildId, channelId }
 */
export async function createSubscription(
  req: Request,
  res: Response,
): Promise<void> {
  const storage = getStorage();
  const { streamerId, guildId, channelId, mentionRoleId } = req.body;

  try {
    // Validate required fields
    if (!streamerId || typeof streamerId !== "string") {
      res.status(400).json({ error: "Missing or invalid 'streamerId' field" });
      return;
    }
    if (!guildId || typeof guildId !== "string") {
      res.status(400).json({ error: "Missing or invalid 'guildId' field" });
      return;
    }
    if (!channelId || typeof channelId !== "string") {
      res.status(400).json({ error: "Missing or invalid 'channelId' field" });
      return;
    }

    // Verify streamer exists
    const streamer = await storage.findStreamerById(streamerId);
    if (!streamer) {
      res.status(404).json({ error: "Streamer not found" });
      return;
    }

    // Check for duplicate subscription (same streamer + guild + channel)
    const existing = await storage.findSubscriptionsByGuild(guildId);
    const duplicate = existing.find(
      (s) => s.streamerId === streamerId && s.channelId === channelId,
    );
    if (duplicate) {
      res.status(409).json({
        error: "Subscription already exists for this streamer and channel",
        subscription: duplicate,
      });
      return;
    }

    const subscription = await storage.createSubscription({
      streamerId,
      guildId,
      channelId,
      mentionRoleId: typeof mentionRoleId === "string" ? mentionRoleId : null,
    });

    logger.info(
      `Created subscription: streamer=${streamerId} guild=${guildId} channel=${channelId}`,
    );

    res.status(201).json({ subscription });
  } catch (error) {
    logger.error("Error creating subscription:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /subscriptions
 *
 * List subscriptions with optional filters.
 * Query: ?guildId=xxx&streamerId=xxx
 */
export async function getSubscriptions(
  req: Request,
  res: Response,
): Promise<void> {
  const storage = getStorage();
  const { guildId, streamerId } = req.query;

  try {
    if (guildId && typeof guildId === "string") {
      const subscriptions = await storage.findSubscriptionsByGuild(guildId);
      res.json({ subscriptions, count: subscriptions.length });
      return;
    }

    if (streamerId && typeof streamerId === "string") {
      const subscriptions = await storage.findSubscriptionsByStreamer(streamerId);
      res.json({ subscriptions, count: subscriptions.length });
      return;
    }

    res.status(400).json({
      error: "Provide either 'guildId' or 'streamerId' query parameter",
    });
  } catch (error) {
    logger.error("Error fetching subscriptions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * DELETE /subscriptions/:id
 *
 * Delete a subscription by ID.
 */
export async function deleteSubscription(
  req: Request,
  res: Response,
): Promise<void> {
  const storage = getStorage();
  const id = req.params.id as string;

  try {
    const existing = await storage.findSubscriptionById(id);
    if (!existing) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }

    await storage.deleteSubscription(id);

    logger.info(`Deleted subscription: ${id}`);
    res.json({ message: "Subscription deleted", id });
  } catch (error) {
    logger.error("Error deleting subscription:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
