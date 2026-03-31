/**
 * Test helper utilities
 *
 * Provides a shared test setup: isolated JSON storage, preconfigured Express app,
 * and env variables so every test suite starts from a clean, deterministic state.
 */

import { mkdirSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const TEST_DATA_DIR = join(__dirname, "..", "data_test");

// ─── Set env BEFORE any app imports ───
process.env.NODE_ENV = "development";
process.env.ADMIN_API_KEY = "test_admin_key_12345";
process.env.BOT_API_KEY = "test_bot_key_67890";
process.env.DISABLE_IP_WHITELIST = "true";
process.env.ALLOWED_ORIGINS = "http://localhost:3000";
process.env.LOG_LEVEL = "error"; // suppress logs during tests

/**
 * Clean and (re)create the test data directory
 */
export function resetTestDataDir(): void {
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DATA_DIR, { recursive: true });
}

/**
 * Remove the test data directory entirely
 */
export function cleanupTestDataDir(): void {
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
}

/**
 * Create a configured Express app for testing.
 * Must be called AFTER setting env and importing modules.
 */
export async function createTestApp() {
  // Dynamic import to ensure env is applied first
  const { createServer } = await import("../src/server.js");
  return createServer();
}

/**
 * Initialize JSON storage for testing
 */
export async function initTestStorage() {
  const { initStorage } = await import("../src/services/storage/index.js");
  await initStorage();
}

/**
 * Close storage after tests
 */
export async function closeTestStorage() {
  const { closeStorage } = await import("../src/services/storage/index.js");
  await closeStorage();
}
