import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import streamerRoutes from "./routes/streamers.js";
import eventRoutes from "./routes/events.js";
import subscriptionRoutes from "./routes/subscriptions.js";
import { ipWhitelist, parseWhitelist } from "./middleware/index.js";
import { logger } from "./utils/logger.js";
import { isSchedulerRunning } from "./services/scheduler.js";

/**
 * Create and configure the Express server
 */
export function createServer(): express.Application {
  const app = express();

  // ─── Trust proxy (for correct IP behind reverse proxy) ───
  app.set("trust proxy", 1);

  // ─── Security Headers ───
  app.use(helmet());

  // ─── CORS - Domain Whitelist ───
  const { origins: allowedOrigins } = parseWhitelist();

  // Always allow localhost in development
  if (process.env.NODE_ENV !== "production") {
    if (!allowedOrigins.includes("http://localhost:3000")) allowedOrigins.push("http://localhost:3000");
    if (!allowedOrigins.includes("http://localhost:5173")) allowedOrigins.push("http://localhost:5173");
  }

  app.use(
    cors({
      origin: function (origin, callback) {
        // Allow requests with no origin (curl, server-to-server)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        logger.warn(`Blocked CORS request from: ${origin}`);
        return callback(new Error("Blocked by CORS"));
      },
      credentials: true,
    }),
  );

  // ─── Rate Limiting ───
  const limiter = rateLimit({
    windowMs: 60 * 1000,       // 1 minute
    max: 60,                    // 60 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
  });
  app.use(limiter);

  // ─── Body Parsing ───
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  // ─── Health Check (no auth) ───
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      scheduler: isSchedulerRunning(),
      timestamp: new Date().toISOString(),
    });
  });

  // ─── API Routes (IP whitelist protects all routes) ───
  app.use("/streamers", ipWhitelist, streamerRoutes);
  app.use("/events", ipWhitelist, eventRoutes);
  app.use("/subscriptions", ipWhitelist, subscriptionRoutes);

  // ─── 404 Handler ───
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // ─── Global Error Handler ───
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      logger.error("Unhandled error:", err.message);

      // CORS errors
      if (err.message === "Blocked by CORS") {
        res.status(403).json({ error: "Blocked by CORS policy" });
        return;
      }

      res.status(500).json({ error: "Internal server error" });
    },
  );

  return app;
}

/**
 * Start the Express server
 */
export function startServer(app: express.Application): void {
  const port = parseInt(process.env.PORT ?? "3000", 10);
  const host = process.env.HOST ?? "0.0.0.0";

  app.listen(port, host, () => {
    logger.info(`🚀 API server running on http://${host}:${port}`);
    logger.info(`   Health check: http://${host}:${port}/health`);
  });
}
