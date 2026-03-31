/**
 * API Endpoint Tests
 *
 * Tests all REST endpoints:
 * - GET    /health
 * - POST   /streamers
 * - GET    /streamers
 * - GET    /streamers/:id
 * - DELETE /streamers/:id
 * - GET    /events
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";

// ─── Set env before any imports ───
process.env.NODE_ENV = "development";
process.env.ADMIN_API_KEY = "test_admin_key_12345";
process.env.BOT_API_KEY = "test_bot_key_67890";
process.env.DISABLE_IP_WHITELIST = "true";
process.env.LOG_LEVEL = "error";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any;
let createdStreamerId: string;

beforeAll(async () => {
  const { initStorage } = await import("../src/services/storage/index.js");
  await initStorage();
  const { createServer } = await import("../src/server.js");
  app = createServer();
});

afterAll(async () => {
  const { closeStorage } = await import("../src/services/storage/index.js");
  await closeStorage();
});

// ═══════════════════════════════════════
//  Health Check
// ═══════════════════════════════════════

describe("GET /health", () => {
  it("should return 200 with status ok", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body).toHaveProperty("uptime");
    expect(res.body).toHaveProperty("timestamp");
  });

  it("should not require authentication", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════
//  POST /streamers
// ═══════════════════════════════════════

describe("POST /streamers", () => {
  it("should create a streamer with valid admin key", async () => {
    const res = await request(app)
      .post("/streamers")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`)
      .send({
        platform: "twitch",
        username: "teststreamer",
        userId: "test_user_1",
      });

    expect(res.status).toBe(201);
    expect(res.body.streamer).toBeDefined();
    expect(res.body.streamer.platform).toBe("twitch");
    expect(res.body.streamer.username).toBe("teststreamer");
    expect(res.body.streamer.id).toBeDefined();

    createdStreamerId = res.body.streamer.id;
  });

  it("should reject duplicate streamer (409)", async () => {
    const res = await request(app)
      .post("/streamers")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`)
      .send({
        platform: "twitch",
        username: "teststreamer",
        userId: "test_user_1",
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already tracked");
  });

  it("should reject missing platform (400)", async () => {
    const res = await request(app)
      .post("/streamers")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`)
      .send({
        username: "testuser",
        userId: "test_user_1",
      });

    expect(res.status).toBe(400);
  });

  it("should reject unsupported platform (400)", async () => {
    const res = await request(app)
      .post("/streamers")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`)
      .send({
        platform: "facebook",
        username: "testuser",
        userId: "test_user_1",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unsupported platform");
  });

  it("should reject missing username (400)", async () => {
    const res = await request(app)
      .post("/streamers")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`)
      .send({
        platform: "twitch",
        userId: "test_user_1",
      });

    expect(res.status).toBe(400);
  });

  it("should reject invalid username characters (400)", async () => {
    const res = await request(app)
      .post("/streamers")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`)
      .send({
        platform: "twitch",
        username: "test user!@#",
        userId: "test_user_1",
      });

    expect(res.status).toBe(400);
  });

  it("should reject missing userId (400)", async () => {
    const res = await request(app)
      .post("/streamers")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`)
      .send({
        platform: "twitch",
        username: "testuser2",
      });

    expect(res.status).toBe(400);
  });

  it("should reject bot key (403)", async () => {
    const res = await request(app)
      .post("/streamers")
      .set("Authorization", `Bearer ${process.env.BOT_API_KEY}`)
      .send({
        platform: "twitch",
        username: "testuser3",
        userId: "test_user_1",
      });

    expect(res.status).toBe(403);
  });

  it("should normalize platform and username to lowercase", async () => {
    const res = await request(app)
      .post("/streamers")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`)
      .send({
        platform: "KICK",
        username: "UpperCaseUser",
        userId: "test_user_2",
      });

    expect(res.status).toBe(201);
    expect(res.body.streamer.platform).toBe("kick");
    expect(res.body.streamer.username).toBe("uppercaseuser");
  });
});

// ═══════════════════════════════════════
//  GET /streamers
// ═══════════════════════════════════════

describe("GET /streamers", () => {
  it("should list streamers with admin key", async () => {
    const res = await request(app)
      .get("/streamers")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.streamers)).toBe(true);
    expect(res.body.streamers.length).toBeGreaterThanOrEqual(1);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.page).toBe(1);
  });

  it("should list streamers with bot key", async () => {
    const res = await request(app)
      .get("/streamers")
      .set("Authorization", `Bearer ${process.env.BOT_API_KEY}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.streamers)).toBe(true);
  });

  it("should filter by platform", async () => {
    const res = await request(app)
      .get("/streamers?platform=twitch")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`);

    expect(res.status).toBe(200);
    for (const s of res.body.streamers) {
      expect(s.platform).toBe("twitch");
    }
  });

  it("should support pagination", async () => {
    const res = await request(app)
      .get("/streamers?page=1&limit=1")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`);

    expect(res.status).toBe(200);
    expect(res.body.streamers.length).toBeLessThanOrEqual(1);
    expect(res.body.pagination.limit).toBe(1);
  });
});

// ═══════════════════════════════════════
//  GET /streamers/:id
// ═══════════════════════════════════════

describe("GET /streamers/:id", () => {
  it("should return streamer by ID", async () => {
    const res = await request(app)
      .get(`/streamers/${createdStreamerId}`)
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`);

    expect(res.status).toBe(200);
    expect(res.body.streamer.id).toBe(createdStreamerId);
    expect(res.body.streamer.platform).toBe("twitch");
  });

  it("should return 404 for not-found ID", async () => {
    const res = await request(app)
      .get("/streamers/nonexistent_id_xyz")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`);

    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════
//  GET /events
// ═══════════════════════════════════════

describe("GET /events", () => {
  it("should return events array", async () => {
    const res = await request(app)
      .get("/events")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(typeof res.body.count).toBe("number");
  });

  it("should accept since parameter", async () => {
    const res = await request(app)
      .get(`/events?since=${new Date().toISOString()}`)
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`);

    expect(res.status).toBe(200);
  });

  it("should reject invalid since (400)", async () => {
    const res = await request(app)
      .get("/events?since=not-a-date")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`);

    expect(res.status).toBe(400);
  });

  it("should reject limit out of range (400)", async () => {
    const res = await request(app)
      .get("/events?limit=999")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`);

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════
//  DELETE /streamers/:id
// ═══════════════════════════════════════

describe("DELETE /streamers/:id", () => {
  it("should reject bot key (403)", async () => {
    const res = await request(app)
      .delete(`/streamers/${createdStreamerId}`)
      .set("Authorization", `Bearer ${process.env.BOT_API_KEY}`);

    expect(res.status).toBe(403);
  });

  it("should delete with admin key", async () => {
    const res = await request(app)
      .delete(`/streamers/${createdStreamerId}`)
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("deleted");
  });

  it("should return 404 after deletion", async () => {
    const res = await request(app)
      .get(`/streamers/${createdStreamerId}`)
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`);

    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════
//  404 Route
// ═══════════════════════════════════════

describe("404 Not Found", () => {
  it("should return 404 for unknown routes", async () => {
    const res = await request(app).get("/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not found");
  });
});
