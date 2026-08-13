/**
 * ================================================================
 *  CONTROLLERS/WRITERS.CONTROLLER.TS
 *  Off-chain writer profile data (display name, bio). Tier and
 *  earnings always come from ShibaWrite.sol directly on the
 *  frontend via wagmi/viem — this backend never duplicates or
 *  tries to be the source of truth for on-chain state.
 * ================================================================
 */

import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { ApiError, asyncHandler } from "../middleware/errorHandler";

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  bio: z.string().max(500).optional(),
});

/** GET /api/writers/:address — public profile lookup */
export const getWriterProfile = asyncHandler(async (req: Request, res: Response) => {
  const address = req.params.address.toLowerCase();

  const writer = await prisma.writer.findUnique({
    where: { walletAddress: address },
    select: {
      walletAddress: true,
      displayName: true,
      bio: true,
      createdAt: true,
      _count: { select: { posts: { where: { status: "CLAIMED" } } } },
    },
  });

  if (!writer) {
    throw new ApiError(404, "Writer not found");
  }

  res.json({
    walletAddress: writer.walletAddress,
    displayName: writer.displayName,
    bio: writer.bio,
    memberSince: writer.createdAt,
    claimedPostCount: writer._count.posts,
  });
});

/** PATCH /api/writers/me — update the authenticated writer's own profile */
export const updateMyProfile = asyncHandler(async (req: Request, res: Response) => {
  const walletAddress = req.walletAddress!;

  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid profile data");
  }

  const updated = await prisma.writer.update({
    where: { walletAddress },
    data: parsed.data,
  });

  res.json({
    walletAddress: updated.walletAddress,
    displayName: updated.displayName,
    bio: updated.bio,
  });
});
