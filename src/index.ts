import "dotenv/config";
import { initStorage, closeStorage, isDevelopment } from "./services/storage/index.js";
import { startScheduler, stopScheduler } from "./services/scheduler.js";
import { createServer, startServer } from "./server.js";
import { logger } from "./utils/logger.js";

/**
 * Main entry point
 *
 * Startup flow:
 * 1. Initialize storage (JSON or Prisma based on NODE_ENV)
 * 2. Start smart scheduler
 * 3. Start API server
 */
async function main(): Promise<void> {
  logger.info("═══════════════════════════════════════════");
  logger.info("  Stream Monitoring Service - Starting...");
  logger.info("═══════════════════════════════════════════");

  const mode = isDevelopment() ? "DEVELOPMENT" : "PRODUCTION";
  logger.info(`  Mode: ${mode}`);

  // Validate required environment variables (production only)
  if (!isDevelopment()) {
    if (!process.env.DATABASE_URL) {
      logger.error("DATABASE_URL is not set in environment variables");
      process.exit(1);
    }
  }

  if (!process.env.ADMIN_API_KEY) {
    logger.warn("ADMIN_API_KEY is not set - admin endpoints will be inaccessible");
  }

  if (!process.env.BOT_API_KEY) {
    logger.warn("BOT_API_KEY is not set - bot endpoints will be inaccessible");
  }

  // Step 1: Initialize storage
  try {
    await initStorage();
  } catch (error) {
    logger.error("Failed to initialize storage. Exiting.", error);
    process.exit(1);
  }

  // Step 2: Start smart scheduler
  startScheduler();

  // Step 3: Create and start API server
  const app = createServer();
  startServer(app);

  logger.info("═══════════════════════════════════════════");
  logger.info("  Service fully operational ✓");
  logger.info("═══════════════════════════════════════════");
}

/**
 * Graceful shutdown
 */
async function shutdown(signal: string): Promise<void> {
  logger.info(`\n${signal} received. Shutting down gracefully...`);

  stopScheduler();
  await closeStorage();

  logger.info("Cleanup complete. Exiting.");
  process.exit(0);
}

// Handle shutdown signals
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection:", reason);
});

// Run
main();
