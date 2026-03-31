<div align="center">

# mewwme-stream-alert

**Real-time stream monitoring API for Discord bots.**

Detects when streamers go live across 5 platforms and delivers instant alerts to Discord channels.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6.5-2D3748?logo=prisma&logoColor=white)](https://prisma.io/)
[![License](https://img.shields.io/github/license/lrmn7/mewwme-stream-alert?color=blue)](./LICENSE)

**Supported Platforms**

[![Twitch](https://img.shields.io/badge/Twitch-9146FF?logo=twitch&logoColor=white)](#)
[![YouTube](https://img.shields.io/badge/YouTube-FF0000?logo=youtube&logoColor=white)](#)
[![TikTok](https://img.shields.io/badge/TikTok-000000?logo=tiktok&logoColor=white)](#)
[![Kick](https://img.shields.io/badge/Kick-53FC18?logo=kick&logoColor=black)](#)
[![Rumble](https://img.shields.io/badge/Rumble-85C742?logo=rumble&logoColor=white)](#)

[Features](#features) | [Quick Start](#quick-start) | [Deploy](#deployment) | [API Docs](#api-reference) | [Fork Guide](#forking-guide)

</div>

---

## Features

| Feature | Description |
|---------|-------------|
| **5 Platforms** | Twitch, YouTube, TikTok, Kick, Rumble |
| **Smart Scheduler** | Dynamic intervals based on streamer activity |
| **Dual Storage** | JSON files (dev) / Prisma MySQL (prod) |
| **Idempotent Alerts** | Restarts never cause duplicate notifications |
| **Unified Whitelist** | Single `WHITELIST` env controls IP + CORS |
| **Per-Guild Config** | Each Discord server picks its channel and mention role |
| **Anti Rate-Limit** | UA rotation, random delays, exponential backoff |
| **Rate Limited API** | 60 req/min per IP |

---

## How It Works

```
+----------------+    +----------------+    +----------------+
|   Scheduler    |--->|    Scraper     |--->|    Storage      |
|  (30s tick)    |    | (per platform) |    | (JSON/Prisma)  |
+----------------+    +----------------+    +-------+--------+
                                                    |
+----------------+    +----------------+            |
|  Discord Bot   |<---|   REST API     |<-----------+
|  (consumer)    |    |   /events      |
+----------------+    +----------------+
```

1. **Scheduler** ticks every 30s, picks streamers due for a check
2. **Scraper** checks live status on the platform
3. On **offline -> live** transition, a `StreamEvent` is created
4. **Discord Bot** polls `GET /events?since=...` for new events
5. Bot sends an embed to the Discord channel, then calls `PATCH /events/:id/notify { guildId }`
6. Next poll skips already-notified guilds (persistent, restart-safe)

### Notification Rules

| Scenario | Alert? | Reason |
|----------|--------|--------|
| Offline -> Live | Yes (1x) | New transition detected |
| Still live (hours later) | No | No new transition |
| Live -> Offline | No | Not a live event |
| Offline -> Live again (new session) | Yes (1x) | New transition, new event |
| Service restarts while live | No | `notifiedGuilds` persisted in storage |

---

## Architecture

```
+-------------------------------------------------------------+
|                    Gateway: Helmet, CORS, Rate Limit         |
+----------------------+--------------------------------------+
                       |
+----------------------v--------------------------------------+
|                    Security: IP Whitelist, Validation        |
+----------------------+--------------------------------------+
                       |
+----------------------v--------------------------------------+
|  Routes (/streamers, /events, /subscriptions)               |
|  Controllers (CRUD + markNotified)                          |
+-----------------------------+-------------------------------+
                              |
+-----------------------------v-------------------------------+
|  Storage: JsonStorage (dev) | PrismaStorage (prod)          |
+-----------------------------+-------------------------------+
                              |
+-----------------------------v-------------------------------+
|  Scheduler + Scrapers: Twitch, YouTube, TikTok, Kick, Rumble|
+-------------------------------------------------------------+
```

---

## Quick Start

> Development uses JSON file storage. No database needed.

```bash
# Clone
git clone https://github.com/lrmn7/mewwme-stream-alert.git
cd mewwme-stream-alert

# Install
npm install

# Configure
echo "NODE_ENV=development" > .env
echo "PORT=3005" >> .env
echo "DISABLE_IP_WHITELIST=true" >> .env

# Run
npm run dev
```

Server starts at `http://localhost:3005`. Done.

---

## Deployment

### Production (VPS / any server)

```bash
npm install
npx prisma generate
npx prisma db push      # first time only
npm run build
npm start
```

**Required `.env`:**

```env
NODE_ENV=production
PORT=3005
DATABASE_URL="mysql://user:pass@host:3306/stream_monitor"
WHITELIST=your-bot-ip,your-frontend.com
DISABLE_IP_WHITELIST=false
```

### Railway

1. Connect your GitHub repo (`lrmn7/mewwme-stream-alert`)
2. Set root directory if monorepo
3. Add env vars in dashboard (see table below)
4. Start command: `npm run build && npm start`

### Render

1. Create a **Web Service**, connect your repo
2. Build: `npm install && npx prisma generate && npm run build`
3. Start: `npm start`
4. Add env vars in dashboard

### Vercel

Create `vercel.json`:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.js" }]
}
```

For the full service (scheduler + scraper + API), use Railway, Render, or a VPS.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | `development` = JSON, `production` = Prisma |
| `PORT` | No | `3005` | Server port |
| `DATABASE_URL` | Prod | - | MySQL connection string |
| `DATABASE_PROVIDER` | No | `mysql` | `mysql` or `postgresql` |
| `WHITELIST` | Prod | - | IPs + domains, comma-separated |
| `DISABLE_IP_WHITELIST` | No | `false` | `true` to disable (dev only) |
| `LOG_LEVEL` | No | `info` | `debug` / `info` / `warn` / `error` |

### WHITELIST

One env var controls both IP whitelist and CORS:

```env
WHITELIST=1.2.3.4,your-frontend.com,http://localhost:3000
```

- Starts with digit or contains `:` -> **IP whitelist**
- Otherwise -> **CORS origin** (auto-prefixed `https://` if no scheme)
- `127.0.0.1`, `::1` always allowed
- Dev mode auto-allows `localhost:3000` and `localhost:5173`

---

## API Reference

### Health

```http
GET /health
```
```json
{ "status": "ok", "uptime": 3600, "scheduler": true, "timestamp": "..." }
```

### Streamers

```http
POST   /streamers                              # Create (body: platform, username, userId)
GET    /streamers?platform=twitch&isLive=true   # List (all params optional)
GET    /streamers/:id                           # Detail (includes events + subscriptions)
DELETE /streamers/:id                           # Delete (cascades events + subscriptions)
```

<details>
<summary>Example: Create Streamer</summary>

**Request:**
```json
{ "platform": "twitch", "username": "mewwme", "userId": "default" }
```

**Response:** `201`
```json
{
  "streamer": {
    "id": "dev_abc123",
    "platform": "twitch",
    "username": "mewwme",
    "displayName": "mewwme",
    "isLive": false,
    "createdAt": "2026-03-31T12:00:00.000Z"
  }
}
```
</details>

### Events

```http
GET   /events?since=ISO&limit=50&streamerId=x   # List events
PATCH /events/:id/notify                         # Mark notified (body: { guildId })
```

<details>
<summary>Example: List Events</summary>

```json
{
  "events": [{
    "id": "evt_abc123",
    "streamerId": "str_abc123",
    "title": "Playing Valorant",
    "thumbnail": "https://...",
    "profileImage": "https://...",
    "url": "https://twitch.tv/mewwme",
    "notifiedGuilds": ["guild_123"],
    "startedAt": "2026-03-31T10:00:00.000Z",
    "createdAt": "2026-03-31T10:00:05.000Z",
    "streamer": { "id": "str_abc123", "platform": "twitch", "username": "mewwme", "displayName": "mewwme" }
  }],
  "count": 1
}
```
</details>

### Subscriptions

```http
POST   /subscriptions                          # Create (body: streamerId, guildId, channelId, mentionRoleId?)
GET    /subscriptions?guildId=x                # List by guild
GET    /subscriptions?streamerId=x             # List by streamer
DELETE /subscriptions/:id                      # Delete
```

---

## Security

| Layer | Details |
|-------|---------|
| **Helmet** | Standard security headers |
| **CORS** | Only `WHITELIST` domains allowed |
| **IP Whitelist** | All routes protected, only whitelisted IPs |
| **Rate Limit** | 60 req/min per IP |
| **Validation** | All inputs validated before processing |

---

## Scheduler Details

**Tick:** every 30 seconds. Processes streamers in batches of 10 with 3s delay between batches.

**Dynamic intervals (production):**

| Last Live | Interval | Reason |
|-----------|----------|--------|
| < 1 day | 5 min | Likely to stream again |
| < 7 days | 10 min | Active |
| < 30 days | 20 min | Semi-active |
| 30+ days | 30 min | Inactive |

Development mode: all streamers checked every **60 seconds**.

### Scraper Methods

| Platform | Method | Data |
|----------|--------|------|
| Twitch | GraphQL API | Title, viewers, game, thumbnail |
| YouTube | HTML (`ytInitialData`) | Title, viewers, thumbnail |
| TikTok | HTML (`SIGI_STATE`) | Title, viewers, avatar |
| Kick | REST API | Title, viewers, category |
| Rumble | HTML scraping | Title, viewers, thumbnail |

Anti rate-limit: UA rotation (12+ strings), 500-1500ms random delay, 3 retries with backoff.

---

## Storage

| | JsonStorage (dev) | PrismaStorage (prod) |
|-|-------------------|---------------------|
| Backend | `data/*.json` files | MySQL via Prisma ORM |
| Database needed | No | Yes |
| Restart | Resets `isLive=false` | No reset |
| Concurrency | Not safe | ACID-compliant |
| Indexing | None | `streamerId`, `createdAt` |

<details>
<summary>IStorage Interface</summary>

```typescript
interface IStorage {
  createStreamer(data): Promise<StoredStreamer>
  findAllActiveStreamers(): Promise<StoredStreamer[]>
  updateStreamer(id, data): Promise<void>
  deleteStreamer(id): Promise<void>

  createEvent(data): Promise<StoredStreamEvent>
  findEvents(filters): Promise<EventWithStreamer[]>
  markEventNotified(eventId, guildId): Promise<void>

  createSubscription(data): Promise<StoredSubscription>
  findSubscriptionsByStreamer(streamerId): Promise<StoredSubscription[]>
  findSubscriptionsByGuild(guildId): Promise<StoredSubscription[]>
  deleteSubscription(id): Promise<void>
}
```
</details>

---

## Project Structure

```
mewwme-stream-alert/
+-- prisma/schema.prisma
+-- data/                        # dev-only JSON storage
+-- src/
|   +-- index.ts                 # entry point
|   +-- server.ts                # Express setup
|   +-- controllers/
|   |   +-- streamerController.ts
|   |   +-- eventController.ts
|   |   +-- subscriptionController.ts
|   +-- routes/
|   |   +-- streamers.ts
|   |   +-- events.ts
|   |   +-- subscriptions.ts
|   +-- middleware/
|   |   +-- ipWhitelist.ts       # IP + CORS whitelist
|   |   +-- validate.ts
|   +-- services/
|   |   +-- scheduler.ts
|   |   +-- scraper/             # twitch, youtube, tiktok, kick, rumble
|   |   +-- storage/             # interface, jsonStorage, prismaStorage
|   +-- utils/logger.ts
+-- tests/
+-- .env
+-- package.json
+-- tsconfig.json
```

---

## Development vs Production

| | Development | Production |
|-|-------------|------------|
| Storage | JSON (`data/*.json`) | Prisma (MySQL) |
| Database | Not needed | Required |
| Check interval | 60s | 5-30 min (dynamic) |
| IP Whitelist | Disabled | Required |
| Restart | Resets `isLive` | No reset |
| CORS | Auto-allows localhost | Only `WHITELIST` |

---

## Testing

```bash
npm test                 # all tests
npm run test:api         # API endpoints
npm run test:security    # security middleware
npm run test:scraper     # scrapers
npm run test:scheduler   # scheduler logic
npm run test:watch       # watch mode
npm run typecheck        # tsc --noEmit
```

---

## Forking Guide

### 1. Fork & Clone

```bash
git clone https://github.com/lrmn7/mewwme-stream-alert.git
cd mewwme-stream-alert
npm install
```

### 2. Configure

```env
NODE_ENV=development
PORT=3005
DISABLE_IP_WHITELIST=true
```

### 3. Run

```bash
npm run dev      # dev (JSON, hot-reload)
npm run build    # compile
npm start        # production
```

### 4. Add a New Platform

Create `src/services/scraper/newplatform.ts`:

```typescript
export async function checkNewPlatform(username: string): Promise<CheckResult> {
  return {
    isLive: true,
    title: "Stream title",
    thumbnail: "https://...",
    profileImage: "https://...",
    url: "https://newplatform.com/" + username,
    viewers: 0,
  };
}
```

Register in `src/services/scraper/index.ts`.

### 5. Production Database

```bash
npx prisma generate
npx prisma db push       # create tables
npx prisma studio        # browse data
```

---

## License

See [LICENSE](./LICENSE) for details.