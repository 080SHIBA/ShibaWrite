/**
 * ================================================================
 *  LOGGER.TS
 *  Central logger. Swap the transport list here later if you want
 *  to ship logs to Datadog/Logtail/etc — nothing else in the app
 *  should call console.log directly.
 * ================================================================
 */

import winston from "winston";

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`;
    })
  ),
  transports: [new winston.transports.Console()],
});
