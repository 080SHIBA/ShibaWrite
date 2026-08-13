/**
 * ================================================================
 *  SIWE.SERVICE.TS
 *  Sign-In With Ethereum (EIP-4361). This is how a writer proves
 *  they control a wallet address without ever handing us a private
 *  key or password: we hand them a one-time nonce, their wallet
 *  signs a structured message containing it, and we verify that
 *  signature server-side.
 * ================================================================
 */

import { SiweMessage, generateNonce } from "siwe";
import { randomUUID } from "crypto";
import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";

const NONCE_TTL_MINUTES = 10;

/**
 * Issues a fresh nonce and stores it for later verification.
 * The frontend embeds this nonce into the SIWE message it asks
 * MetaMask to sign.
 */
export async function issueNonce(): Promise<string> {
  const nonce = generateNonce();
  const expiresAt = new Date(Date.now() + NONCE_TTL_MINUTES * 60 * 1000);

  await prisma.siweNonce.create({
    data: { nonce, expiresAt },
  });

  return nonce;
}

/**
 * Verifies a signed SIWE message against the nonce we issued.
 * Returns the recovered wallet address on success, throws on failure.
 * The nonce is deleted immediately after use so it can never be replayed.
 */
export async function verifySiwe(message: string, signature: string): Promise<string> {
  const siweMessage = new SiweMessage(message);

  const storedNonce = await prisma.siweNonce.findUnique({
    where: { nonce: siweMessage.nonce },
  });

  if (!storedNonce) {
    throw new Error("Unknown or already-used nonce");
  }

  if (storedNonce.expiresAt < new Date()) {
    await prisma.siweNonce.delete({ where: { nonce: siweMessage.nonce } });
    throw new Error("Nonce expired, please request a new one");
  }

  const result = await siweMessage.verify({ signature });

  // Consume the nonce regardless of outcome — a failed attempt should not be retryable
  await prisma.siweNonce.delete({ where: { nonce: siweMessage.nonce } }).catch(() => {
    // already deleted, ignore
  });

  if (!result.success) {
    logger.warn(`SIWE verification failed for ${siweMessage.address}: ${result.error?.type}`);
    throw new Error("Signature verification failed");
  }

  return siweMessage.address.toLowerCase();
}

/**
 * Convenience helper for building the domain/statement fields the
 * frontend should use when constructing its SiweMessage. Exposed so
 * the frontend and backend never drift out of sync on these values.
 */
export function siweMessageDefaults(domain: string, uri: string) {
  return {
    domain,
    uri,
    version: "1",
    statement: "Sign in to ShibaWrite to verify wallet ownership.",
    requestId: randomUUID(),
  };
}
