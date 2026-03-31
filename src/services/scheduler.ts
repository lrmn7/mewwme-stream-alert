import { getStorage } from "./storage/index.js";
import type { StoredStreamer } from "./storage/index.js";
import { getChecker, sleep } from "./scraper/index.js";
import { logger } from "../utils/logger.js";

/**
 * Minimum check interval in seconds
 * Development: 60s (1 minute), Production: 300s (5 minutes)
 */
const MIN_INTERVAL_SECONDS = process.env.NODE_ENV === "production" ? 300 : 60;

/**
 * Maximum streamers per batch
 */
const BATCH_SIZE = 10;

/**
 * Delay between batches in milliseconds
 */
const BATCH_DELAY_MS = 3000;

/**
 * Scheduler loop interval (how often to look for streamers to check)
 */
const SCHEDULER_TICK_MS = 30_000; // 30 seconds

/**
 * Calculate days since a given date (ISO string or null)
 */
function daysSince(dateStr: string | null): number {
  if (!dateStr) return Infinity;
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  return (now - then) / (1000 * 60 * 60 * 24);
}

/**
 * Get the dynamic check interval for a streamer (in seconds)
 * NEVER returns below MIN_INTERVAL_SECONDS (5 minutes)
 */
function getCheckInterval(streamer: StoredStreamer): number {
  const days = daysSince(streamer.lastLiveAt);

  // In development, use shorter intervals for testing
  if (process.env.NODE_ENV !== "production") {
    return MIN_INTERVAL_SECONDS; // 60s in dev
  }

  let interval: number;
  if (days <= 1) interval = 300;       // 5 minutes
  else if (days <= 7) interval = 600;  // 10 minutes
  else if (days <= 30) interval = 1200; // 20 minutes
  else interval = 1800;                 // 30 minutes

  return Math.max(interval, MIN_INTERVAL_SECONDS);
}

/**
 * Filter streamers that are ready to be checked
 */
function filterReady(streamers: StoredStreamer[]): StoredStreamer[] {
  const now = Date.now();

  return streamers.filter((s) => {
    if (s.isArchived) return false;

    const interval = getCheckInterval(s);
    if (!s.lastCheckedAt) return true;

    return now - new Date(s.lastCheckedAt).getTime() >= interval * 1000;
  });
}

/**
 * Sort streamers by priority (higher priority first, then most recent activity)
 */
function sortByPriority(streamers: StoredStreamer[]): StoredStreamer[] {
  return streamers.sort((a, b) => {
    // Higher priority score first
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    // Then by most recent activity (smaller daysSince = higher priority)
    const aDays = daysSince(a.lastLiveAt);
    const bDays = daysSince(b.lastLiveAt);
    return aDays - bDays;
  });
}

/**
 * Process a single streamer check
 */
async function processStreamer(streamer: StoredStreamer): Promise<void> {
  const storage = getStorage();
  const checker = getChecker(streamer.platform);

  if (!checker) {
    logger.warn(`No checker found for platform: ${streamer.platform}`);
    return;
  }

  try {
    const result = await checker(streamer.username);
    const now = new Date();

    logger.info(
      `[${streamer.platform}] ${streamer.username}: ${result.isLive ? "LIVE" : "offline"}${result.error ? ` (error: ${result.error})` : ""}`,
    );

    // Detect offline → live transition
    const wentLive = result.isLive && !streamer.isLive;

    if (wentLive) {
      // Create stream event
      await storage.createEvent({
        streamerId: streamer.id,
        title: result.title,
        thumbnail: result.thumbnail,
        profileImage: result.profileImage,
        url: result.url,
        startedAt: result.startedAt ? new Date(result.startedAt) : now,
      });

      logger.info(
        `🔴 ${streamer.username} (${streamer.platform}) went LIVE: ${result.title ?? "No title"}`,
      );
    }

    // Detect live → offline transition
    if (!result.isLive && streamer.isLive) {
      logger.info(
        `⚫ ${streamer.username} (${streamer.platform}) went OFFLINE`,
      );
    }

    // Calculate inactive days
    const lastLiveDate = result.isLive ? now.toISOString() : streamer.lastLiveAt;
    const inactiveDays = lastLiveDate
      ? Math.floor(daysSince(lastLiveDate))
      : streamer.inactiveDays;

    // Update streamer record
    await storage.updateStreamer(streamer.id, {
      isLive: result.isLive,
      lastCheckedAt: now.toISOString(),
      lastLiveAt: result.isLive ? now.toISOString() : streamer.lastLiveAt,
      checkInterval: getCheckInterval(streamer),
      inactiveDays: Math.max(0, inactiveDays),
    });
  } catch (error) {
    logger.error(
      `Error processing ${streamer.platform}:${streamer.username}:`,
      error,
    );

    // Still update lastCheckedAt to prevent hammering on errors
    try {
      await storage.updateStreamer(streamer.id, {
        lastCheckedAt: new Date().toISOString(),
      });
    } catch {
      /* ignore update errors */
    }
  }
}

/**
 * Run a single scheduler cycle
 */
async function runCycle(): Promise<void> {
  const storage = getStorage();

  try {
    // Fetch all non-archived streamers
    const allStreamers = await storage.findAllActiveStreamers();

    if (allStreamers.length === 0) {
      logger.debug("No streamers to check");
      return;
    }

    // Filter ready + sort by priority
    const ready = sortByPriority(filterReady(allStreamers));

    if (ready.length === 0) {
      logger.debug("No streamers ready to check this cycle");
      return;
    }

    logger.info(`Scheduler: ${ready.length} streamers ready to check`);

    // Process in batches
    for (let i = 0; i < ready.length; i += BATCH_SIZE) {
      const batch = ready.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(ready.length / BATCH_SIZE);

      logger.info(
        `Processing batch ${batchNum}/${totalBatches} (${batch.length} streamers)`,
      );

      // Process batch concurrently
      await Promise.allSettled(
        batch.map((streamer) => processStreamer(streamer)),
      );

      // Delay between batches (skip delay after last batch)
      if (i + BATCH_SIZE < ready.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }
  } catch (error) {
    logger.error("Scheduler cycle error:", error);
  }
}

/**
 * Scheduler state
 */
let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Start the smart scheduler
 */
export function startScheduler(): void {
  if (isRunning) {
    logger.warn("Scheduler is already running");
    return;
  }

  isRunning = true;
  logger.info(
    `Starting smart scheduler (tick: ${SCHEDULER_TICK_MS / 1000}s, batch: ${BATCH_SIZE}, min interval: ${MIN_INTERVAL_SECONDS}s)`,
  );

  // Run immediately
  runCycle();

  // Then run on interval
  schedulerInterval = setInterval(() => {
    runCycle();
  }, SCHEDULER_TICK_MS);
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  isRunning = false;
  logger.info("Scheduler stopped");
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning(): boolean {
  return isRunning;
}
