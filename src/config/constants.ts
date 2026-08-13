/**
 * ================================================================
 *  CONSTANTS.TS
 *  Every value here mirrors a constant or enum baked into
 *  ShibaWrite.sol. Keeping them duplicated (rather than reading
 *  them from the chain on every request) is intentional — these
 *  values almost never change, and validating against them here
 *  lets us reject a bad submission before spending money on
 *  plagiarism/AI API calls or gas.
 *
 *  If you ever call setBaseRate(), setCategoryMultiplier(), etc.
 *  through governance, remember to update the matching value here.
 * ================================================================
 */

/** PRD 3.1 / ShibaWrite.sol MIN_WORDS / MAX_WORDS */
export const MIN_WORDS = 200;
export const MAX_WORDS = 3500;

/** PRD 3.4 / ShibaWrite.sol QUALITY_MIN / QUALITY_MAX (scaled x100) */
export const QUALITY_MIN = 50; // 0.5x
export const QUALITY_MAX = 200; // 2.0x

/**
 * PRD 3.3 — Category enum, must match ShibaWrite.sol's Category enum
 * ordering exactly. The uint8 index is what gets signed and sent
 * on-chain, so this list's order is load-bearing.
 */
export const CATEGORIES = [
  "ShortLifestyle",
  "OpinionBlog",
  "FictionNovel",
  "LongJournalism",
  "TechnicalTutorial",
  "AcademicResearch",
] as const;

export type CategoryName = (typeof CATEGORIES)[number];

export function categoryIdFromName(name: CategoryName): number {
  return CATEGORIES.indexOf(name);
}

/**
 * Scoring thresholds for the approve / human-review / reject decision.
 * These are backend-only judgment calls — ShibaWrite.sol has no
 * knowledge of them, it only ever sees the final qualityScore that
 * results from an APPROVE decision.
 *
 * Raw combined score is 0-100. Below REJECT_THRESHOLD is an
 * automatic reject; between the two thresholds goes to a human
 * moderator; above APPROVE_THRESHOLD is auto-approved.
 */
export const AUTO_APPROVE_THRESHOLD = 75;
export const AUTO_REJECT_THRESHOLD = 45;

/** Minimum "human-likely" score from the AI-detection API to even be considered */
export const MIN_AI_HUMAN_SCORE = 40;

/** How long a signed reward claim remains valid before the writer must re-request it */
export const SIGNATURE_EXPIRY_SECONDS = 15 * 60; // 15 minutes

/** Quality score >= this value (out of 200) triggers NFT-eligibility on-chain (90% of 200) */
export const NFT_ELIGIBLE_QUALITY_SCORE = 180;
