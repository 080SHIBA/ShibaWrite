/**
 * ================================================================
 *  CONTROLLERS/AUTH.CONTROLLER.TS
 *  Handles the SIWE login flow: issue a nonce, verify the signed
 *  message, then set a session cookie.
 * ================================================================
 */

import { Request, Response } from "express";
import { z } from "zod";
import { issueNonce, verifySiwe } from "../services/siwe.service";
import { issueSessionToken } from "../middleware/auth";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { ApiError, asyncHandler } from "../middleware/errorHandler";

const verifySchema = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
});

/** GET /api/auth/nonce — issues a one-time nonce for the frontend to embed in its SIWE message */
export const getNonce = asyncHandler(async (_req: Request, res: Response) => {
  const nonce = await issueNonce();
  res.json({ nonce });
});

/** POST /api/auth/verify — verifies the signed SIWE message and starts a session */
export const verify = asyncHandler(async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "message and signature are required");
  }

  const { message, signature } = parsed.data;

  let walletAddress: string;
  try {
    walletAddress = await verifySiwe(message, signature);
  } catch (err) {
    throw new ApiError(401, (err as Error).message);
  }

  // Ensure a Writer row exists so foreign keys (Post, WriterNonce) have somewhere to point
  await prisma.writer.upsert({
    where: { walletAddress },
    create: { walletAddress },
    update: {},
  });

  const token = issueSessionToken(walletAddress);

  res
    .cookie(env.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: env.JWT_EXPIRY_SECONDS * 1000,
    })
    .json({ walletAddress });
});

/** POST /api/auth/logout — clears the session cookie */
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie(env.SESSION_COOKIE_NAME).json({ success: true });
});

/** GET /api/auth/me — returns the currently authenticated wallet, if any */
export const me = asyncHandler(async (req: Request, res: Response) => {
  res.json({ walletAddress: req.walletAddress ?? null });
});
