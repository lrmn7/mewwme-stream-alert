import type { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger.js";

/**
 * Parse the WHITELIST env into IP addresses and domain origins.
 *
 * Values that look like IPs (start with a digit or contain `:`) go into the IP list.
 * Everything else is treated as a CORS-allowed origin.
 *
 * Localhost IPs (127.0.0.1, ::1, ::ffff:127.0.0.1) are always included.
 */
export function parseWhitelist(): { ips: string[]; origins: string[] } {
  const raw = process.env.WHITELIST ?? "";
  const entries = raw.split(",").map((e) => e.trim()).filter(Boolean);

  const ips = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
  const origins: string[] = [];

  for (const entry of entries) {
    // Anything starting with a digit or containing ':' (IPv6) is an IP
    if (/^\d/.test(entry) || (entry.includes(":") && !entry.startsWith("http"))) {
      if (!ips.includes(entry)) ips.push(entry);
    } else {
      // Origins — normalise: if no scheme, add https://
      const origin = entry.startsWith("http") ? entry : `https://${entry}`;
      if (!origins.includes(origin)) origins.push(origin);
    }
  }

  return { ips, origins };
}

/**
 * IP whitelist middleware
 *
 * Only allows requests from trusted IP addresses defined in the
 * WHITELIST environment variable (comma-separated).
 *
 * Set DISABLE_IP_WHITELIST=true to skip this check (development only!)
 */
export function ipWhitelist(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Allow disabling for development
  if (process.env.DISABLE_IP_WHITELIST === "true") {
    return next();
  }

  const { ips } = parseWhitelist();
  const clientIP = req.ip ?? req.socket.remoteAddress ?? "";

  if (!ips.includes(clientIP)) {
    logger.warn(`Blocked request from unauthorized IP: ${clientIP}`);
    res.status(403).json({ error: "Forbidden: IP not whitelisted" });
    return;
  }

  next();
}
