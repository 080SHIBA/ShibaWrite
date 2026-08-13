/**
 * ================================================================
 *  ENV.TS
 *  Validates process.env at startup using zod, so the server fails
 *  fast and loudly if a required variable is missing or malformed,
 *  instead of crashing later mid-request in a confusing way.
 * ================================================================
 */

import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  FRONTEND_ORIGIN: z.string().url(),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRY_SECONDS: z.coerce.number().default(86400),
  SESSION_COOKIE_NAME: z.string().default("shibawrite_session"),

  RPC_URL: z.string().url(),
  CHAIN_ID: z.coerce.number(),
  CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "CONTRACT_ADDRESS must be a valid address"),
  MINTER_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "MINTER_PRIVATE_KEY must be a valid private key"),

  WINSTON_AI_API_KEY: z.string().min(1, "WINSTON_AI_API_KEY is required"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
