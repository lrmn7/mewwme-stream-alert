import { Router } from "express";
import { getEvents, markEventNotified } from "../controllers/eventController.js";
import { validateEventQuery } from "../middleware/index.js";

const router = Router();

/**
 * GET /events - Get stream events
 */
router.get("/", validateEventQuery, getEvents);

/**
 * PATCH /events/:id/notify - Mark event as notified for a guild
 */
router.patch("/:id/notify", markEventNotified);

export default router;
