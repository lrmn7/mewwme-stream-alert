/**
 * Security Tests
 *
 * Tests all security layers:
 * 1. API key authentication (missing, invalid, valid)
 * 2. Role-based access control (admin vs bot)
 * 3. IP whitelist enforcement
 * 4. Request validation
 * 5. Rate limiting headers
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";

// ─── Set env BEFORE any app imports ───
process.env.NODE_ENV = "development";
process.env.ADMIN_API_KEY = "sec_admin_key_xxx";
process.env.BOT_API_KEY = "sec_bot_key_yyy";
process.env.DISABLE_IP_WHITELIST = "true";
process.env.LOG_LEVEL = "error";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any;

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
//  1. Authentication - Missing API Key
// ═══════════════════════════════════════

describe("Authentication: Missing API Key", () => {
  it("GET /streamers without auth → 401", async () => {
    const res = await request(app).get("/streamers");
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Missing authorization");
  });

  it("POST /streamers without auth → 401", async () => {
    const res = await request(app)
      .post("/streamers")
      .send({ platform: "twitch", username: "test", userId: "test" });
    expect(res.status).toBe(401);
  });

  it("GET /events without auth → 401", async () => {
    const res = await request(app).get("/events");
    expect(res.status).toBe(401);
  });

  it("DELETE /streamers/:id without auth → 401", async () => {
    const res = await request(app).delete("/streamers/someid");
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════
//  2. Authentication - Wrong API Key
// ═══════════════════════════════════════

describe("Authentication: Wrong API Key", () => {
  it("should reject completely wrong key → 403", async () => {
    const res = await request(app)
      .get("/streamers")
      .set("Authorization", "Bearer completely_wrong_key");

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Invalid API key");
  });

  it("should reject malformed bearer format → 401", async () => {
    const res = await request(app)
      .get("/streamers")
      .set("Authorization", "Token some_key");

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Invalid authorization format");
  });

  it("should reject bearer without token → 401", async () => {
    const res = await request(app)
      .get("/streamers")
      .set("Authorization", "Bearer");

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════
//  3. Role-Based Access Control
// ═══════════════════════════════════════

describe("Role-Based Access Control", () => {
  it("bot key CAN read streamers", async () => {
    const res = await request(app)
      .get("/streamers")
      .set("Authorization", `Bearer ${process.env.BOT_API_KEY}`);

    expect(res.status).toBe(200);
  });

  it("bot key CANNOT create streamers", async () => {
    const res = await request(app)
      .post("/streamers")
      .set("Authorization", `Bearer ${process.env.BOT_API_KEY}`)
      .send({
        platform: "twitch",
        username: "sectest",
        userId: "sec_user",
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("insufficient permissions");
  });

  it("bot key CANNOT delete streamers", async () => {
    const res = await request(app)
      .delete("/streamers/someid")
      .set("Authorization", `Bearer ${process.env.BOT_API_KEY}`);

    expect(res.status).toBe(403);
  });

  it("admin key CAN create streamers", async () => {
    const uniqueUsername = `secadmin_${Date.now()}`;
    const res = await request(app)
      .post("/streamers")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`)
      .send({
        platform: "youtube",
        username: uniqueUsername,
        userId: "sec_user_admin",
      });

    expect(res.status).toBe(201);
  });

  it("admin key CAN read streamers", async () => {
    const res = await request(app)
      .get("/streamers")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`);

    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════
//  4. IP Whitelist
// ═══════════════════════════════════════

describe("IP Whitelist", () => {
  it("should pass when DISABLE_IP_WHITELIST=true", async () => {
    // Already set in env - events should be accessible
    const res = await request(app)
      .get("/events")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`);

    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════
//  5. Rate Limiting Headers
// ═══════════════════════════════════════

describe("Rate Limiting", () => {
  it("should include rate limit headers in response", async () => {
    const res = await request(app)
      .get("/health");

    expect(res.status).toBe(200);
    // express-rate-limit sets standard headers
    expect(res.headers).toHaveProperty("ratelimit-limit");
    expect(res.headers).toHaveProperty("ratelimit-remaining");
  });
});

// ═══════════════════════════════════════
//  6. Security Headers (Helmet)
// ═══════════════════════════════════════

describe("Security Headers", () => {
  it("should set X-Content-Type-Options", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("should set X-Frame-Options or CSP", async () => {
    const res = await request(app).get("/health");
    // Helmet v5+ uses CSP frame-ancestors instead of X-Frame-Options
    const hasFrameProtection =
      res.headers["x-frame-options"] ||
      res.headers["content-security-policy"];
    expect(hasFrameProtection).toBeTruthy();
  });
});

// ═══════════════════════════════════════
//  7. Input Validation
// ═══════════════════════════════════════

describe("Input Validation", () => {
  it("should reject empty body on POST /streamers", async () => {
    const res = await request(app)
      .post("/streamers")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("should reject username with special chars", async () => {
    const res = await request(app)
      .post("/streamers")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`)
      .send({
        platform: "twitch",
        username: "<script>alert(1)</script>",
        userId: "test",
      });

    expect(res.status).toBe(400);
  });

  it("should reject username longer than 50 chars", async () => {
    const res = await request(app)
      .post("/streamers")
      .set("Authorization", `Bearer ${process.env.ADMIN_API_KEY}`)
      .send({
        platform: "twitch",
        username: "a".repeat(51),
        userId: "test",
      });

    expect(res.status).toBe(400);
  });
});
