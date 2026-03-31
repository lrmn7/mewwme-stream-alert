import { logger } from "../../utils/logger.js";
import type { IStorage } from "./interface.js";
import { JsonStorage } from "./jsonStorage.js";
import { PrismaStorage } from "./prismaStorage.js";

export type { IStorage } from "./interface.js";
export type {
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

/**
 * Singleton storage instance
 */
let storage: IStorage | null = null;

/**
 * Check if we're in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Get the storage instance (creates on first call)
 *
 * Auto-switches based on NODE_ENV:
 * - development → JsonStorage (file-based, no DB needed)
 * - production  → PrismaStorage (MySQL/PostgreSQL)
 */
export function getStorage(): IStorage {
  if (!storage) {
    if (isDevelopment()) {
      logger.info("📁 Using JSON file storage (development mode)");
      storage = new JsonStorage();
    } else {
      logger.info("🗄️  Using Prisma database storage (production mode)");
      storage = new PrismaStorage();
    }
  }
  return storage;
}

/**
 * Initialize the storage
 */
export async function initStorage(): Promise<void> {
  const store = getStorage();
  await store.init();
}

/**
 * Close the storage
 */
export async function closeStorage(): Promise<void> {
  if (storage) {
    await storage.close();
    storage = null;
  }
}
