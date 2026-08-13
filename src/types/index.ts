/**
 * ================================================================
 *  TYPES/INDEX.TS
 *  Shared types used across services, controllers, and routes.
 * ================================================================
 */

/** Result of the AI-generation + plagiarism check (Originality.ai) */
export interface PlagiarismResult {
  aiGeneratedScore: number; // 0-100, higher = more likely human-written
  plagiarismScore: number; // 0-100, higher = more original (100 = fully original)
}

/** Result of the LLM-based quality/coherence/depth check */
export interface QualityResult {
  authenticity: number; // 0-100
  depth: number; // 0-100
  structure: number; // 0-100
  relevance: number; // 0-100
  rawScore: number; // 0-100 combined average
}

/** Final decision the scoring pipeline reaches for a submitted post */
export type ScoringDecision = "APPROVE" | "REJECT" | "HUMAN_REVIEW";

export interface ScoringOutcome {
  decision: ScoringDecision;
  qualityScoreScaled: number; // 50-200, only meaningful when decision === "APPROVE"
  aiGeneratedScore: number;
  plagiarismScore: number;
  rawQualityScore: number;
  reason: string;
}

/** The exact payload the frontend needs to call approvePost() on ShibaWrite.sol */
export interface SignedRewardClaim {
  writer: string;
  postId: string;
  wordCount: number;
  categoryId: number;
  qualityScore: number;
  nonce: string; // BigInt serialized as string for JSON
  expiry: number;
  signature: string;
}

/** Augment Express's Request type with the authenticated wallet address */
declare global {
  namespace Express {
    interface Request {
      walletAddress?: string;
    }
  }
}
