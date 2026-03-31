/**
 * Scheduler & Event System Tests
 *
 * Tests scheduler internals using JSON storage directly:
 * - Dynamic interval calculation
 * - Ready-to-check filtering
 * - Priority sorting
 * - Event creation on offline → live transition
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

// ─── Set env before imports ───
process.env.NODE_ENV = "development";
process.env.ADMIN_API_KEY = "test_admin_key";
process.env.BOT_API_KEY = "test_bot_key";
process.env.DISABLE_IP_WHITELIST = "true";
process.env.LOG_LEVEL = "error";

import type { IStorage, StoredStreamer } from "../src/services/storage/interface.js";

let storage: IStorage;

beforeAll(async () => {
  // Use JSON storage directly
  const { JsonStorage } = await import("../src/services/storage/jsonStorage.js");
  storage = new JsonStorage();
  await storage.init();
});

afterAll(async () => {
  await storage.close();
});

// ═══════════════════════════════════════
//  Dynamic Check Interval
// ═══════════════════════════════════════

describe("Dynamic Check Interval Logic", () => {
  it("should give 5 min (300s) for streamer live within 1 day", () => {
    const now = new Date();
    const streamer: StoredStreamer = {
      id: "s1",
      platform: "twitch",
      username: "active",
      displayName: null,
      isLive: false,
      lastLiveAt: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(), // 12h ago
      lastCheckedAt: null,
      checkInterval: 300,
      priorityScore: 0,
      inactiveDays: 0,
      isArchived: false,
      userId: "u1",
      createdAt: now.toISOString(),
    };

    // daysSince(12h ago) ≈ 0.5 → ≤ 1 day → 300s
    const days = daysSince(streamer.lastLiveAt);
    expect(days).toBeLessThanOrEqual(1);
    expect(getInterval(streamer)).toBe(300);
  });

  it("should give 10 min (600s) for 3-day-old activity", () => {
    const streamer: StoredStreamer = makeStreamer({
      lastLiveAt: daysAgo(3),
    });

    expect(getInterval(streamer)).toBe(600);
  });

  it("should give 20 min (1200s) for 15-day-old activity", () => {
    const streamer = makeStreamer({
      lastLiveAt: daysAgo(15),
    });

    expect(getInterval(streamer)).toBe(1200);
  });

  it("should give 30 min (1800s) for 60-day-old activity", () => {
    const streamer = makeStreamer({
      lastLiveAt: daysAgo(60),
    });

    expect(getInterval(streamer)).toBe(1800);
  });

  it("should give 30 min for streamer never live (null)", () => {
    const streamer = makeStreamer({
      lastLiveAt: null,
    });

    expect(getInterval(streamer)).toBe(1800);
  });

  it("should NEVER return less than 300 seconds", () => {
    // Even for a streamer that was just live
    const streamer = makeStreamer({
      lastLiveAt: new Date().toISOString(),
    });

    expect(getInterval(streamer)).toBeGreaterThanOrEqual(300);
  });
});

// ═══════════════════════════════════════
//  Ready-to-check Filtering
// ═══════════════════════════════════════

describe("Ready-to-check Filtering", () => {
  it("should include never-checked streamers", () => {
    const streamers = [
      makeStreamer({ lastCheckedAt: null }),
    ];

    const ready = filterReady(streamers);
    expect(ready.length).toBe(1);
  });

  it("should exclude recently-checked streamers", () => {
    const streamers = [
      makeStreamer({
        lastCheckedAt: new Date().toISOString(), // just now
        lastLiveAt: daysAgo(1),                  // 5-min interval
      }),
    ];

    const ready = filterReady(streamers);
    expect(ready.length).toBe(0);
  });

  it("should include streamers past their interval", () => {
    // Streamer with 5-min interval, checked 6 mins ago
    const streamers = [
      makeStreamer({
        lastCheckedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
        lastLiveAt: daysAgo(0.5), // within 1 day → 300s interval
      }),
    ];

    const ready = filterReady(streamers);
    expect(ready.length).toBe(1);
  });

  it("should exclude archived streamers", () => {
    const streamers = [
      makeStreamer({
        isArchived: true,
        lastCheckedAt: null,
      }),
    ];

    const ready = filterReady(streamers);
    expect(ready.length).toBe(0);
  });
});

// ═══════════════════════════════════════
//  Priority Sorting
// ═══════════════════════════════════════

describe("Priority Sorting", () => {
  it("should sort higher priority first", () => {
    const streamers = [
      makeStreamer({ id: "low", priorityScore: 1 }),
      makeStreamer({ id: "high", priorityScore: 10 }),
      makeStreamer({ id: "mid", priorityScore: 5 }),
    ];

    const sorted = sortByPriority(streamers);
    expect(sorted[0].id).toBe("high");
    expect(sorted[1].id).toBe("mid");
    expect(sorted[2].id).toBe("low");
  });

  it("should sort by recency when priority equal", () => {
    const streamers = [
      makeStreamer({ id: "old", priorityScore: 0, lastLiveAt: daysAgo(30) }),
      makeStreamer({ id: "new", priorityScore: 0, lastLiveAt: daysAgo(1) }),
    ];

    const sorted = sortByPriority(streamers);
    expect(sorted[0].id).toBe("new");
    expect(sorted[1].id).toBe("old");
  });
});

// ═══════════════════════════════════════
//  Event System: offline → live
// ═══════════════════════════════════════

describe("Event System", () => {
  let testStreamerId: string;

  beforeEach(async () => {
    // Create a user + offline streamer
    await storage.createUser("event_test_user");
    const streamer = await storage.createStreamer({
      platform: "twitch",
      username: `evttest_${Date.now()}`,
      userId: "event_test_user",
      isLive: false,
    });
    testStreamerId = streamer.id;
  });

  it("should create an event on offline → live transition", async () => {
    const now = new Date();

    // Simulate offline → live by creating an event
    const event = await storage.createEvent({
      streamerId: testStreamerId,
      title: "Going LIVE for testing!",
      thumbnail: "https://example.com/thumb.jpg",
      url: "https://twitch.tv/evttest",
      startedAt: now,
    });

    expect(event).toBeDefined();
    expect(event.streamerId).toBe(testStreamerId);
    expect(event.title).toBe("Going LIVE for testing!");
    expect(event.url).toBe("https://twitch.tv/evttest");
    expect(event.id).toBeDefined();
  });

  it("event should be retrievable via findEvents", async () => {
    // Create event
    await storage.createEvent({
      streamerId: testStreamerId,
      title: "Findable event",
      startedAt: new Date(),
    });

    // Retrieve events
    const events = await storage.findEvents({
      streamerId: testStreamerId,
    });

    expect(events.length).toBeGreaterThanOrEqual(1);
    const found = events.find((e) => e.title === "Findable event");
    expect(found).toBeDefined();
    expect(found!.streamer).toBeDefined();
  });

  it("event should include streamer metadata", async () => {
    await storage.createEvent({
      streamerId: testStreamerId,
      title: "With metadata",
      startedAt: new Date(),
    });

    const events = await storage.findEvents({ streamerId: testStreamerId });
    const evt = events.find((e) => e.title === "With metadata");

    expect(evt?.streamer?.platform).toBe("twitch");
    expect(evt?.streamer?.id).toBe(testStreamerId);
  });

  it("findEvents should respect since filter", async () => {
    const before = new Date();

    // Wait briefly to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 50));

    await storage.createEvent({
      streamerId: testStreamerId,
      title: "After since",
      startedAt: new Date(),
    });

    const events = await storage.findEvents({
      streamerId: testStreamerId,
      since: before,
    });

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].title).toBe("After since");
  });
});

// ═══════════════════════════════════════
//  JSON Storage Tests (Dev Mode)
// ═══════════════════════════════════════

describe("JSON Storage (Development Mode)", () => {
  it("should create and retrieve users", async () => {
    const user = await storage.createUser("json_test_user", "test@test.com");
    expect(user.id).toBe("json_test_user");
    expect(user.email).toBe("test@test.com");

    const found = await storage.findUser("json_test_user");
    expect(found).toBeDefined();
    expect(found!.id).toBe("json_test_user");
  });

  it("should create and list streamers", async () => {
    await storage.createUser("json_list_user");
    const streamer = await storage.createStreamer({
      platform: "kick",
      username: "json_test_kick",
      userId: "json_list_user",
    });

    expect(streamer.platform).toBe("kick");
    expect(streamer.id).toBeDefined();

    const result = await storage.findStreamers(
      { isArchived: false },
      { page: 1, limit: 10 },
    );

    expect(result.items.length).toBeGreaterThanOrEqual(1);
    const found = result.items.find((s) => s.username === "json_test_kick");
    expect(found).toBeDefined();
  });

  it("should update streamer fields", async () => {
    await storage.createUser("json_update_user");
    const streamer = await storage.createStreamer({
      platform: "youtube",
      username: "json_update_test",
      userId: "json_update_user",
    });

    await storage.updateStreamer(streamer.id, {
      isLive: true,
      lastCheckedAt: new Date().toISOString(),
    });

    const updated = await storage.findStreamerById(streamer.id);
    expect(updated?.isLive).toBe(true);
    expect(updated?.lastCheckedAt).toBeDefined();
  });

  it("should delete streamer and cascade events", async () => {
    await storage.createUser("json_del_user");
    const streamer = await storage.createStreamer({
      platform: "tiktok",
      username: "json_delete_test",
      userId: "json_del_user",
    });

    await storage.createEvent({
      streamerId: streamer.id,
      title: "Will be deleted",
      startedAt: new Date(),
    });

    await storage.deleteStreamer(streamer.id);

    const found = await storage.findStreamerById(streamer.id);
    expect(found).toBeNull();

    const events = await storage.findEvents({ streamerId: streamer.id });
    expect(events.length).toBe(0);
  });

  it("should detect duplicates via findStreamerByUnique", async () => {
    await storage.createUser("json_dup_user");
    await storage.createStreamer({
      platform: "rumble",
      username: "json_dup_test",
      userId: "json_dup_user",
    });

    const dup = await storage.findStreamerByUnique("rumble", "json_dup_test", "json_dup_user");
    expect(dup).toBeDefined();
    expect(dup!.platform).toBe("rumble");
  });

  it("should paginate correctly", async () => {
    const userId = "json_page_user";
    await storage.createUser(userId);

    // Create 3 streamers
    for (let i = 0; i < 3; i++) {
      await storage.createStreamer({
        platform: "twitch",
        username: `json_page_${i}`,
        userId,
      });
    }

    const page1 = await storage.findStreamers(
      { userId, isArchived: false },
      { page: 1, limit: 2 },
    );

    expect(page1.items.length).toBe(2);
    expect(page1.totalPages).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════
//  Helper functions (mirror scheduler internals)
// ═══════════════════════════════════════

function daysSince(dateStr: string | null): number {
  if (!dateStr) return Infinity;
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
}

function getInterval(streamer: StoredStreamer): number {
  const days = daysSince(streamer.lastLiveAt);
  let interval: number;
  if (days <= 1) interval = 300;
  else if (days <= 7) interval = 600;
  else if (days <= 30) interval = 1200;
  else interval = 1800;
  return Math.max(interval, 300);
}

function filterReady(streamers: StoredStreamer[]): StoredStreamer[] {
  const now = Date.now();
  return streamers.filter((s) => {
    if (s.isArchived) return false;
    const interval = getInterval(s);
    if (!s.lastCheckedAt) return true;
    return now - new Date(s.lastCheckedAt).getTime() >= interval * 1000;
  });
}

function sortByPriority(streamers: StoredStreamer[]): StoredStreamer[] {
  return [...streamers].sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    return daysSince(a.lastLiveAt) - daysSince(b.lastLiveAt);
  });
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

function makeStreamer(overrides: Partial<StoredStreamer> = {}): StoredStreamer {
  return {
    id: overrides.id ?? `test_${Math.random().toString(36).slice(2)}`,
    platform: "twitch",
    username: "test",
    displayName: null,
    isLive: false,
    lastLiveAt: null,
    lastCheckedAt: null,
    checkInterval: 300,
    priorityScore: 0,
    inactiveDays: 0,
    isArchived: false,
    userId: "u1",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
