import { Router } from "express";
import {
  createSubscription,
  getSubscriptions,
  deleteSubscription,
} from "../controllers/subscriptionController.js";

const router = Router();

/**
 * POST /subscriptions - Create a subscription
 */
router.post("/", createSubscription);

/**
 * GET /subscriptions - List subscriptions
 * Query: ?guildId=xxx or ?streamerId=xxx
 */
router.get("/", getSubscriptions);

/**
 * DELETE /subscriptions/:id - Delete a subscription
 */
router.delete("/:id", deleteSubscription);

export default router;
