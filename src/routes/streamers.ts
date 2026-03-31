import { Router } from "express";
import {
  createStreamer,
  getStreamers,
  getStreamerById,
  deleteStreamer,
} from "../controllers/streamerController.js";
import { validateStreamerBody } from "../middleware/index.js";

const router = Router();

/**
 * POST /streamers - Create a new streamer
 */
router.post("/", validateStreamerBody, createStreamer);

/**
 * GET /streamers - List all streamers
 */
router.get("/", getStreamers);

/**
 * GET /streamers/:id - Get a single streamer
 */
router.get("/:id", getStreamerById);

/**
 * DELETE /streamers/:id - Delete a streamer
 */
router.delete("/:id", deleteStreamer);

export default router;
