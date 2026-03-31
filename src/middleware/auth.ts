import type { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger.js";

/**
 * Extend Express Request to include role
 */
declare global {
  namespace Express {
    interface Request {
      role?: "admin" | "bot";
    }
  }
}

/**
 * API Key authentication middleware
 *
 * Checks Authorization header for Bearer token and maps to role.
 * - ADMIN_API_KEY → role: "admin"
 * - BOT_API_KEY → role: "bot"
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: "Missing authorization header" });
    return;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    res.status(401).json({ error: "Invalid authorization format. Use: Bearer <token>" });
    return;
  }

  const token = parts[1];

  if (token === process.env.ADMIN_API_KEY) {
    req.role = "admin";
  } else if (token === process.env.BOT_API_KEY) {
    req.role = "bot";
  } else {
    logger.warn(`Invalid API key attempt from ${req.ip}`);
    res.status(403).json({ error: "Invalid API key" });
    return;
  }

  next();
}

/**
 * Role-based access control middleware
 *
 * Requires the request to have a specific role assigned by authMiddleware.
 * Can accept a single role or an array of allowed roles.
 */
export function requireRole(...roles: Array<"admin" | "bot">) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.role || !roles.includes(req.role)) {
      res.status(403).json({ error: "Forbidden: insufficient permissions" });
      return;
    }
    next();
  };
}
