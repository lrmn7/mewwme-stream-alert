/**
 * Scraper Utility Tests
 *
 * Tests scraper helper functions:
 * - User-Agent rotation
 * - Random delay
 * - Retry with exponential backoff
 * - Platform checker registry
 */

import { describe, it, expect, vi } from "vitest";

// ─── Suppress logs ───
process.env.LOG_LEVEL = "error";

// ═══════════════════════════════════════
//  User-Agent Rotation
// ═══════════════════════════════════════

describe("User-Agent Rotation", () => {
  it("should return a non-empty string", async () => {
    const { getRandomUserAgent } = await import("../src/services/scraper/helpers.js");
    const ua = getRandomUserAgent();

    expect(typeof ua).toBe("string");
    expect(ua.length).toBeGreaterThan(10);
  });

  it("should return browser-like User-Agent strings", async () => {
    const { getRandomUserAgent } = await import("../src/services/scraper/helpers.js");
    const ua = getRandomUserAgent();

    expect(ua).toContain("Mozilla/5.0");
  });

  it("should return different UAs over multiple calls", async () => {
    const { getRandomUserAgent } = await import("../src/services/scraper/helpers.js");
    const uas = new Set<string>();

    // Call enough times to get variation (pool has 12 UAs)
    for (let i = 0; i < 50; i++) {
      uas.add(getRandomUserAgent());
    }

    // Should have seen at least 2 different UAs
    expect(uas.size).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════
//  Random Delay
// ═══════════════════════════════════════

describe("Random Delay", () => {
  it("should resolve after a delay within range", async () => {
    const { randomDelay } = await import("../src/services/scraper/helpers.js");
    const start = performance.now();
    await randomDelay(50, 150);
    const elapsed = performance.now() - start;

    // Allow some tolerance
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(300);
  });

  it("sleep should wait the specified time", async () => {
    const { sleep } = await import("../src/services/scraper/helpers.js");
    const start = performance.now();
    await sleep(100);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(80);
  });
});

// ═══════════════════════════════════════
//  Retry Logic
// ═══════════════════════════════════════

describe("Retry Logic (withRetry)", () => {
  it("should return result on first success", async () => {
    const { withRetry } = await import("../src/services/scraper/helpers.js");
    const fn = vi.fn().mockResolvedValue("success");

    const result = await withRetry(fn, 3, "test");
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on failure and succeed", async () => {
    const { withRetry } = await import("../src/services/scraper/helpers.js");
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockResolvedValue("recovered");

    const result = await withRetry(fn, 3, "test");
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should throw after max retries exhausted", async () => {
    const { withRetry } = await import("../src/services/scraper/helpers.js");
    const fn = vi.fn().mockRejectedValue(new Error("persistent failure"));

    await expect(
      withRetry(fn, 2, "test"),
    ).rejects.toThrow("persistent failure");

    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ═══════════════════════════════════════
//  Platform Checker Registry
// ═══════════════════════════════════════

describe("Platform Checker Registry", () => {
  it("should have checkers for all 5 platforms", async () => {
    const { getChecker, SUPPORTED_PLATFORMS } = await import(
      "../src/services/scraper/index.js"
    );

    for (const platform of SUPPORTED_PLATFORMS) {
      const checker = getChecker(platform);
      expect(checker).toBeDefined();
      expect(typeof checker).toBe("function");
    }
  });

  it("should return undefined for unsupported platform", async () => {
    const { getChecker } = await import("../src/services/scraper/index.js");
    const checker = getChecker("facebook");
    expect(checker).toBeUndefined();
  });

  it("isPlatformSupported should validate correctly", async () => {
    const { isPlatformSupported } = await import(
      "../src/services/scraper/index.js"
    );

    expect(isPlatformSupported("twitch")).toBe(true);
    expect(isPlatformSupported("youtube")).toBe(true);
    expect(isPlatformSupported("tiktok")).toBe(true);
    expect(isPlatformSupported("kick")).toBe(true);
    expect(isPlatformSupported("rumble")).toBe(true);
    expect(isPlatformSupported("facebook")).toBe(false);
    expect(isPlatformSupported("")).toBe(false);
  });
});
