/**
 * ================================================================
 *  PLAGIARISM.SERVICE.TS
 *  Calls Winston AI to check whether submitted content is
 *  AI-generated and/or plagiarized. This is Layer 1 of the 5-layer
 *  anti-spam defense from the PRD.
 *
 *  Why Winston AI instead of Originality.ai: Winston AI's developer
 *  API gives every new account 2,500 free credits with no credit
 *  card required, which is enough to run the full scoring pipeline
 *  through your testing phase before you need to pay anything —
 *  useful while you're still demoing this to investors.
 *
 *  Docs: https://docs.gowinston.ai/api-reference/v2/plagiarism/post
 *        https://docs.gowinston.ai/api-reference/v2/ai-content-detection/post
 * ================================================================
 */

import axios from "axios";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { PlagiarismResult } from "../types";

const WINSTON_BASE_URL = "https://api.gowinston.ai";

interface WinstonPlagiarismResponse {
  result: {
    score: number; // % of text identified as plagiarized (0-100)
  };
}

interface WinstonAiDetectionResponse {
  score: number; // "Human score" 0-100 — higher = more likely human-written
}

/**
 * Scores a piece of content for AI-generation likelihood and originality
 * using Winston AI's two separate endpoints, called in parallel.
 * Returns 0-100 scales where HIGHER is always better for the writer
 * (100 = confidently human-written and confidently original).
 *
 * On API failure, we fail closed by routing to human review rather
 * than either auto-approving or auto-rejecting — see scoring.service.ts.
 */
export async function checkPlagiarismAndAiOrigin(content: string): Promise<PlagiarismResult> {
  try {
    const headers = {
      Authorization: `Bearer ${env.WINSTON_AI_API_KEY}`,
      "Content-Type": "application/json",
    };

    const [plagiarismRes, aiDetectionRes] = await Promise.all([
      axios.post<WinstonPlagiarismResponse>(
        `${WINSTON_BASE_URL}/v2/plagiarism`,
        { text: content, language: "auto", country: "us" },
        { headers, timeout: 20_000 }
      ),
      axios.post<WinstonAiDetectionResponse>(
        `${WINSTON_BASE_URL}/v2/ai-content-detection`,
        { text: content, version: "latest", sentences: false, language: "auto" },
        { headers, timeout: 20_000 }
      ),
    ]);

    const plagiarismPct = plagiarismRes.data.result.score; // 0-100, % plagiarized
    const humanScore = aiDetectionRes.data.score; // 0-100, higher = more human

    return {
      // Winston's AI detection score is already "higher = more human" — use directly
      aiGeneratedScore: Math.round(humanScore),
      // Winston's plagiarism score is "% plagiarized" — invert so higher = more original
      plagiarismScore: Math.round(100 - plagiarismPct),
    };
  } catch (err) {
    logger.error(`Winston AI request failed: ${(err as Error).message}`);
    // Re-throw so the caller can decide how to handle the failure —
    // scoring.service.ts routes this to HUMAN_REVIEW rather than guessing.
    throw new Error("Plagiarism/AI-detection service unavailable");
  }
}
