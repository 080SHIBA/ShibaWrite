/**
 * ================================================================
 *  SCORING.SERVICE.TS
 *  The orchestrator. Takes raw submitted content, runs it through
 *  both the plagiarism/AI-detection check and the quality check in
 *  parallel, then applies the APPROVE / HUMAN_REVIEW / REJECT
 *  decision tree described in the PRD's Layer 1 defense.
 * ================================================================
 */

import { checkPlagiarismAndAiOrigin } from "./plagiarism.service";
import { scoreQuality, mapRawScoreToContractScale } from "./quality.service";
import {
  AUTO_APPROVE_THRESHOLD,
  AUTO_REJECT_THRESHOLD,
  MIN_AI_HUMAN_SCORE,
} from "../config/constants";
import { ScoringOutcome } from "../types";
import { logger } from "../utils/logger";

/**
 * Combines the plagiarism/AI score and the quality score into one
 * weighted 0-100 figure, then routes to a decision. Weights:
 *   - AI-generated / human-authenticity score: 35%
 *   - Plagiarism / originality score:          25%
 *   - Quality (authenticity+depth+structure+relevance avg): 40%
 *
 * These weights are a starting point — tune them once you have real
 * submission data and can see where false positives/negatives cluster.
 */
export async function scorePost(title: string, content: string): Promise<ScoringOutcome> {
  let aiGeneratedScore: number;
  let plagiarismScore: number;
  let rawQualityScore: number;

  try {
    const [plagiarismResult, qualityResult] = await Promise.all([
      checkPlagiarismAndAiOrigin(content),
      scoreQuality(title, content),
    ]);

    aiGeneratedScore = plagiarismResult.aiGeneratedScore;
    plagiarismScore = plagiarismResult.plagiarismScore;
    rawQualityScore = qualityResult.rawScore;
  } catch (err) {
    // Either scoring API failed — fail closed to human review rather
    // than guessing. This protects both the writer (no unfair auto-reject)
    // and the treasury (no unfair auto-approve on a blind spot).
    logger.warn(`Scoring pipeline degraded, routing to human review: ${(err as Error).message}`);
    return {
      decision: "HUMAN_REVIEW",
      qualityScoreScaled: 0,
      aiGeneratedScore: 0,
      plagiarismScore: 0,
      rawQualityScore: 0,
      reason: "Automated scoring temporarily unavailable — queued for manual review",
    };
  }

  // Hard floor: content that reads as clearly AI-generated is rejected
  // outright regardless of how well-structured it otherwise looks.
  if (aiGeneratedScore < MIN_AI_HUMAN_SCORE) {
    return {
      decision: "REJECT",
      qualityScoreScaled: 0,
      aiGeneratedScore,
      plagiarismScore,
      rawQualityScore,
      reason: `Content scored too low on human-authenticity (${aiGeneratedScore}/100, minimum is ${MIN_AI_HUMAN_SCORE})`,
    };
  }

  const combinedScore = Math.round(
    aiGeneratedScore * 0.35 + plagiarismScore * 0.25 + rawQualityScore * 0.4
  );

  if (combinedScore >= AUTO_APPROVE_THRESHOLD) {
    return {
      decision: "APPROVE",
      qualityScoreScaled: mapRawScoreToContractScale(rawQualityScore),
      aiGeneratedScore,
      plagiarismScore,
      rawQualityScore,
      reason: `Combined score ${combinedScore}/100 met the auto-approve threshold`,
    };
  }

  if (combinedScore < AUTO_REJECT_THRESHOLD) {
    return {
      decision: "REJECT",
      qualityScoreScaled: 0,
      aiGeneratedScore,
      plagiarismScore,
      rawQualityScore,
      reason: `Combined score ${combinedScore}/100 fell below the minimum threshold`,
    };
  }

  return {
    decision: "HUMAN_REVIEW",
    qualityScoreScaled: mapRawScoreToContractScale(rawQualityScore),
    aiGeneratedScore,
    plagiarismScore,
    rawQualityScore,
    reason: `Combined score ${combinedScore}/100 fell in the grey zone — queued for manual review`,
  };
}
