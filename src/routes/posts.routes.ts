import { Router } from "express";
import rateLimit from "express-rate-limit";
import { submitPost, getMyPosts, markClaimed } from "../controllers/posts.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

/**
 * Submission is rate-limited per IP on top of the daily on-chain mint
 * cap in ShibaWrite.sol — the contract protects token supply, this
 * protects the scoring APIs (which cost real money per call) from
 * being hammered.
 */
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions, please slow down and try again shortly." },
});

router.post("/submit", requireAuth, submitLimiter, submitPost);
router.get("/mine", requireAuth, getMyPosts);
router.post("/:postId/mark-claimed", requireAuth, markClaimed);

export default router;
