/**
 * ================================================================
 *  MIDDLEWARE/ERRORHANDLER.TS
 *  Catches anything thrown or passed to next(err) from any route,
 *  logs it, and returns a clean JSON error instead of leaking a
 *  stack trace to the client.
 * ================================================================
 */

import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  const message = err instanceof Error ? err.message : "Unknown error";
  logger.error(`Unhandled error on ${req.method} ${req.path}: ${message}`);

  res.status(500).json({ error: "Internal server error" });
}

/** Wraps an async route handler so thrown errors reach errorHandler() */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
