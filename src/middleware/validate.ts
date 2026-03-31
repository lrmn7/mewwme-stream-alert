import type { Request, Response, NextFunction } from "express";
import { isPlatformSupported } from "../services/scraper/index.js";

/**
 * Validation error response helper
 */
function validationError(res: Response, message: string): void {
  res.status(400).json({ error: message });
}

/**
 * Validate streamer creation request body
 *
 * Requires:
 * - platform: must be a supported platform
 * - username: 1-50 characters, alphanumeric + underscores/hyphens
 * - userId: must be a non-empty string
 */
export function validateStreamerBody(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { platform, username, userId } = req.body;

  // Platform validation
  if (!platform || typeof platform !== "string") {
    validationError(res, "Missing or invalid 'platform' field");
    return;
  }

  const normalizedPlatform = platform.toLowerCase();
  if (!isPlatformSupported(normalizedPlatform)) {
    validationError(
      res,
      `Unsupported platform '${platform}'. Allowed: twitch, youtube, tiktok, kick, rumble`,
    );
    return;
  }

  // Username validation
  if (!username || typeof username !== "string") {
    validationError(res, "Missing or invalid 'username' field");
    return;
  }

  const trimmedUsername = username.trim();
  if (trimmedUsername.length < 1 || trimmedUsername.length > 50) {
    validationError(res, "Username must be between 1 and 50 characters");
    return;
  }

  if (!/^[a-zA-Z0-9_\-\.]+$/.test(trimmedUsername)) {
    validationError(
      res,
      "Username can only contain letters, numbers, underscores, hyphens, and dots",
    );
    return;
  }

  // userId validation
  if (!userId || typeof userId !== "string") {
    validationError(res, "Missing or invalid 'userId' field");
    return;
  }

  // Normalize body
  req.body.platform = platform.toLowerCase();
  req.body.username = trimmedUsername.toLowerCase();

  next();
}

/**
 * Validate event query parameters
 */
export function validateEventQuery(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { since, limit } = req.query;

  if (since && typeof since === "string") {
    const date = new Date(since);
    if (isNaN(date.getTime())) {
      validationError(res, "Invalid 'since' parameter. Use ISO 8601 format.");
      return;
    }
  }

  if (limit && typeof limit === "string") {
    const parsed = parseInt(limit, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 500) {
      validationError(res, "'limit' must be between 1 and 500");
      return;
    }
  }

  next();
}
