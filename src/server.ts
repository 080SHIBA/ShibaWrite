/**
 * ================================================================
 *  SERVER.TS
 *  Application entry point. Wires up middleware, mounts routes,
 *  and starts listening.
 *
 *  Run with:  npm run dev     (development, hot reload)
 *             npm run build && npm start   (production)
 * ================================================================
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import { env } from "./config/env";
import { logger } from "./utils/logger";
import { errorHandler } from "./middleware/errorHandler";
import { getMinterAddress } from "./services/signing.service";

import authRoutes from "./routes/auth.routes";
import postsRoutes from "./routes/posts.routes";
import writersRoutes from "./routes/writers.routes";

const app = express();

// --- Core middleware ---
app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_ORIGIN,
    credentials: true, // required so the session cookie is sent/received cross-origin
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// --- Health check ---
app.get("/health", (_req, res) => {
  res.json({ status: "ok", minterAddress: getMinterAddress() });
});

// --- Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/posts", postsRoutes);
app.use("/api/writers", writersRoutes);

// --- 404 fallback ---
app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

// --- Centralized error handler (must be registered last) ---
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`ShibaWrite backend listening on port ${env.PORT} [${env.NODE_ENV}]`);
  logger.info(`Minter wallet address: ${getMinterAddress()}`);
  logger.info(`Signing for contract: ${env.CONTRACT_ADDRESS} on chain ${env.CHAIN_ID}`);
});
