/**
 * ================================================================
 *  CONTROLLERS/POSTS.CONTROLLER.TS
 *  The core pipeline: writer submits content → we score it →
 *  we either sign a reward claim, reject it, or queue it for a
 *  human moderator. This is the piece that ties everything else
 *  in this backend together.
 * ================================================================
 */

import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { scorePost } from "../services/scoring.service";
import { signRewardClaim, generatePostId } from "../services/signing.service";
import { MIN_WORDS, MAX_WORDS, CATEGORIES } from "../config/constants";
import { ApiError, asyncHandler } from "../middleware/errorHandler";
import { logger } from "../utils/logger";

const submitSchema = z.object({
  title: z.string().min(1).max(300),
  content: z.string().min(1),
  category: z.enum(CATEGORIES),
});

function countWords(content: string): number {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * POST /api/posts/submit
 * Runs a submitted post through the full scoring pipeline. On approval,
 * returns a signed EIP-712 claim the frontend can submit directly to
 * ShibaWrite.sol's approvePost(). On rejection or grey-zone, returns
 * the post's status without a signature.
 */
export const submitPost = asyncHandler(async (req: Request, res: Response) => {
  const writerAddress = req.walletAddress!;

  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid submission");
  }

  const { title, content, category } = parsed.data;
  const categoryId = CATEGORIES.indexOf(category);
  const wordCount = countWords(content);

  // Reject obviously out-of-range submissions before spending anything
  // on the plagiarism/AI/quality API calls.
  if (wordCount < MIN_WORDS || wordCount > MAX_WORDS) {
    throw new ApiError(
      400,
      `Word count must be between ${MIN_WORDS} and ${MAX_WORDS} (submitted: ${wordCount})`
    );
  }

  const internalId = randomUUID();
  const postId = generatePostId(writerAddress, internalId);

  const outcome = await scorePost(title, content);

  logger.info(
    `Post scored for ${writerAddress}: decision=${outcome.decision} reason="${outcome.reason}"`
  );

  if (outcome.decision === "REJECT") {
    const post = await prisma.post.create({
      data: {
        id: internalId,
        postId,
        writerAddress,
        title,
        content,
        wordCount,
        categoryId,
        aiGeneratedScore: outcome.aiGeneratedScore,
        plagiarismScore: outcome.plagiarismScore,
        rejectionReason: outcome.reason,
        status: "REJECTED",
      },
    });

    res.status(200).json({
      status: "REJECTED",
      reason: outcome.reason,
      postId: post.postId,
    });
    return;
  }

  if (outcome.decision === "HUMAN_REVIEW") {
    const post = await prisma.post.create({
      data: {
        id: internalId,
        postId,
        writerAddress,
        title,
        content,
        wordCount,
        categoryId,
        aiGeneratedScore: outcome.aiGeneratedScore,
        plagiarismScore: outcome.plagiarismScore,
        status: "PENDING_REVIEW",
      },
    });

    res.status(200).json({
      status: "PENDING_REVIEW",
      reason: outcome.reason,
      postId: post.postId,
    });
    return;
  }

  // --- APPROVE path: sign the reward claim ---
  const claim = await signRewardClaim({
    writer: writerAddress,
    postId,
    wordCount,
    categoryId,
    qualityScore: outcome.qualityScoreScaled,
  });

  await prisma.post.create({
    data: {
      id: internalId,
      postId,
      writerAddress,
      title,
      content,
      wordCount,
      categoryId,
      aiGeneratedScore: outcome.aiGeneratedScore,
      plagiarismScore: outcome.plagiarismScore,
      qualityScore: outcome.qualityScoreScaled,
      rewardNonce: BigInt(claim.nonce),
      signature: claim.signature,
      expiry: BigInt(claim.expiry),
      status: "APPROVED",
    },
  });

  res.status(200).json({
    status: "APPROVED",
    reason: outcome.reason,
    claim,
  });
});

/** GET /api/posts/mine — all posts submitted by the authenticated writer */
export const getMyPosts = asyncHandler(async (req: Request, res: Response) => {
  const writerAddress = req.walletAddress!;

  const posts = await prisma.post.findMany({
    where: { writerAddress },
    orderBy: { createdAt: "desc" },
  });

  // BigInt fields need explicit stringification for JSON serialization
  const serialized = posts.map((p) => ({
    ...p,
    rewardNonce: p.rewardNonce?.toString() ?? null,
    expiry: p.expiry?.toString() ?? null,
  }));

  res.json({ posts: serialized });
});

/**
 * POST /api/posts/:postId/mark-claimed
 * Called by the frontend after the writer successfully submits
 * approvePost() (or later claimReward()) on-chain, so our records
 * reflect that the claim has actually been used.
 */
export const markClaimed = asyncHandler(async (req: Request, res: Response) => {
  const writerAddress = req.walletAddress!;
  const { postId } = req.params;

  const post = await prisma.post.findUnique({ where: { postId } });

  if (!post || post.writerAddress !== writerAddress) {
    throw new ApiError(404, "Post not found");
  }

  if (post.status !== "APPROVED") {
    throw new ApiError(400, `Post is not in an approved state (current: ${post.status})`);
  }

  await prisma.post.update({
    where: { postId },
    data: { status: "CLAIMED" },
  });

  res.json({ success: true });
});
