import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger.js";

/**
 * Singleton Prisma client instance
 */
let prisma: PrismaClient;

/**
 * Get the Prisma client instance (singleton)
 */
export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.LOG_LEVEL === "debug"
        ? ["query", "info", "warn", "error"]
        : ["warn", "error"],
    });
  }
  return prisma;
}

/**
 * Connect to the database
 */
export async function connectDatabase(): Promise<void> {
  const client = getPrisma();
  try {
    await client.$connect();
    logger.info("Connected to database");
  } catch (error) {
    logger.error("Failed to connect to database:", error);
    throw error;
  }
}

/**
 * Disconnect from the database
 */
export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    logger.info("Disconnected from database");
  }
}

export { prisma };
