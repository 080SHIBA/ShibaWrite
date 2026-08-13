/**
 * ================================================================
 *  QUALITY.SERVICE.TS
 *  Uses Google Gemini to judge the dimensions that a plagiarism/AI-
 *  detector can't: is this genuinely well-written, structured, and
 *  relevant to its own stated topic? This is the "quality" half of
 *  Layer 1, complementing plagiarism.service.ts's "originality" half.
 *
 *  Why Gemini instead of a paid model for this stage: the Gemini
 *  API free tier requires no credit card and doesn't expire like a
 *  one-time trial credit does — it's rate-limited (currently around
 *  10-15 requests/minute and several hundred requests/day on
 *  Flash-Lite, see ai.google.dev/pricing for current numbers) rather
 *  than metered by spend. That's a good match for a pre-revenue
 *  testing/demo phase. When you're ready for production volume,
 *  swap the model call below for Claude or GPT — the QualityResult
 *  interface this function returns stays identical either way, so
 *  nothing else in the pipeline needs to change.
 * ================================================================
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { QualityResult } from "../types";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

// Flash-Lite currently sits on the most generous free-tier quota — swap to
// "gemini-2.5-flash" or "gemini-2.5-pro" later if you need higher accuracy
// and are ready to move off the free tier's rate limits.
const SCORING_MODEL = "gemini-2.5-flash-lite";

/**
 * Asks Gemini to score a post on four dimensions, each 0-100.
 * The prompt forces JSON-only output so this can be parsed reliably
 * without any conversational wrapper text to strip out.
 */
export async function scoreQuality(title: string, content: string): Promise<QualityResult> {
  const prompt = `You are a strict content quality evaluator for a paid writing platform.
Score the following post on four dimensions, each from 0 to 100:

- authenticity: Does this read like genuine human writing with a real point of view, not generic filler?
- depth: Are original ideas, specific details, or real expertise present, rather than surface-level restatement?
- structure: Does it have a clear introduction, logically ordered body, and a conclusion appropriate to its length?
- relevance: Does the content actually match its own stated title and stay on topic throughout?

Title: ${title}

Content:
"""
${content}
"""

Respond with ONLY a JSON object in this exact shape, nothing else, no markdown fences:
{"authenticity": <0-100>, "depth": <0-100>, "structure": <0-100>, "relevance": <0-100>}`;

  try {
    const model = genAI.getGenerativeModel({
      model: SCORING_MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 200,
        temperature: 0.2,
      },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const parsed = JSON.parse(text) as {
      authenticity: number;
      depth: number;
      structure: number;
      relevance: number;
    };

    const rawScore = Math.round(
      (parsed.authenticity + parsed.depth + parsed.structure + parsed.relevance) / 4
    );

    return { ...parsed, rawScore };
  } catch (err) {
    logger.error(`Quality scoring failed: ${(err as Error).message}`);
    throw new Error("Quality scoring service unavailable");
  }
}

/**
 * Maps a 0-100 raw quality score onto the contract's 50-200 scaled
 * range (representing the 0.5x-2.0x multiplier in the reward formula).
 * Linear mapping: raw 0 -> 50, raw 100 -> 200.
 */
export function mapRawScoreToContractScale(rawScore: number): number {
  const scaled = 50 + rawScore * 1.5;
  return Math.round(Math.min(200, Math.max(50, scaled)));
}
