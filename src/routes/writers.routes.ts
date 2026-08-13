import { Router } from "express";
import { getWriterProfile, updateMyProfile } from "../controllers/writers.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/:address", getWriterProfile);
router.patch("/me", requireAuth, updateMyProfile);

export default router;
