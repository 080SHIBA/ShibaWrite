/**
 * ================================================================
 *  SIGNING.SERVICE.TS
 *  Signs EIP-712 typed messages that ShibaWrite.sol's approvePost()
 *  function verifies on-chain. The domain and types declared here
 *  MUST match the contract exactly:
 *
 *    EIP712("ShibaWrite", "1")   ← constructor in ShibaWrite.sol
 *
 *    bytes32 public constant REWARD_TYPEHASH = keccak256(
 *      "Reward(address writer,bytes32 postId,uint256 wordCount,"
 *      "uint256 categoryId,uint256 qualityScore,uint256 nonce,uint256 expiry)"
 *    );
 *
 *  If you ever change the struct fields, order, or types in the
 *  contract's REWARD_TYPEHASH, this file's `types` object must be
 *  updated to match byte-for-byte, or every signature this service
 *  produces will fail ECDSA.recover() on-chain.
 * ================================================================
 */

import { Wallet, keccak256, toUtf8Bytes, TypedDataDomain, TypedDataField } from "ethers";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { SIGNATURE_EXPIRY_SECONDS } from "../config/constants";
import { SignedRewardClaim } from "../types";

const minterWallet = new Wallet(env.MINTER_PRIVATE_KEY);

/** Must match `EIP712("ShibaWrite", "1")` in the contract constructor exactly */
const domain: TypedDataDomain = {
  name: "ShibaWrite",
  version: "1",
  chainId: env.CHAIN_ID,
  verifyingContract: env.CONTRACT_ADDRESS,
};

/** Must match REWARD_TYPEHASH's field names, order, and types exactly */
const types: Record<string, TypedDataField[]> = {
  Reward: [
    { name: "writer", type: "address" },
    { name: "postId", type: "bytes32" },
    { name: "wordCount", type: "uint256" },
    { name: "categoryId", type: "uint256" },
    { name: "qualityScore", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
};

/**
 * Generates a deterministic, unique bytes32 postId from the writer's
 * address, an internal UUID, and the current timestamp. This is the
 * value stored as `postId` both in our database and, later, on-chain.
 */
export function generatePostId(writerAddress: string, internalId: string): string {
  return keccak256(toUtf8Bytes(`${writerAddress.toLowerCase()}-${internalId}-${Date.now()}`));
}

/**
 * Atomically reads and increments a writer's next EIP-712 nonce.
 * Wrapped in a transaction so two concurrent approvals for the same
 * writer can never receive the same nonce — the DB row lock inside
 * the transaction serializes these calls per writer.
 */
async function getNextNonce(writerAddress: string): Promise<bigint> {
  const result = await prisma.$transaction(async (tx) => {
    const record = await tx.writerNonce.upsert({
      where: { walletAddress: writerAddress },
      create: { walletAddress: writerAddress, nextNonce: BigInt(1) },
      update: { nextNonce: { increment: 1 } },
    });
    // The value *before* incrementing is the nonce we hand out this time
    return record.nextNonce - BigInt(1);
  });

  return result;
}

/**
 * Signs a reward claim for a fully-scored, approved post. Returns
 * everything the frontend needs to call ShibaWrite.sol's approvePost().
 */
export async function signRewardClaim(params: {
  writer: string;
  postId: string;
  wordCount: number;
  categoryId: number;
  qualityScore: number;
}): Promise<SignedRewardClaim> {
  const { writer, postId, wordCount, categoryId, qualityScore } = params;

  const nonce = await getNextNonce(writer);
  const expiry = Math.floor(Date.now() / 1000) + SIGNATURE_EXPIRY_SECONDS;

  const value = {
    writer,
    postId,
    wordCount,
    categoryId,
    qualityScore,
    nonce,
    expiry,
  };

  const signature = await minterWallet.signTypedData(domain, types, value);

  return {
    writer,
    postId,
    wordCount,
    categoryId,
    qualityScore,
    nonce: nonce.toString(),
    expiry,
    signature,
  };
}

/** Exposed for health checks / debugging — confirms which address is signing */
export function getMinterAddress(): string {
  return minterWallet.address;
}
