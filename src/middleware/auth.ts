/**
 * ================================================================
 *  MIDDLEWARE/AUTH.TS
 *  Verifies the session JWT issued after a successful SIWE login.
 *  On success, attaches the wallet address to req.walletAddress for
 *  downstream controllers to use.
 * ================================================================
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

interface SessionPayload {
  walletAddress: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[env.SESSION_COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: "Not authenticated. Please sign in with your wallet." });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as SessionPayload;
    req.walletAddress = payload.walletAddress;
    next();
  } catch {
    res.status(401).json({ error: "Session expired or invalid. Please sign in again." });
  }
}

export function issueSessionToken(walletAddress: string): string {
  const payload: SessionPayload = { walletAddress };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRY_SECONDS });
}
