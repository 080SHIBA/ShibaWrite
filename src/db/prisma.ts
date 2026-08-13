/**
 * ================================================================
 *  PRISMA.TS
 *  Single shared Prisma client instance. In dev mode, ts-node-dev's
 *  hot-reload can otherwise spawn a new PrismaClient on every file
 *  change, quickly exhausting Postgres's connection limit — so we
 *  cache the instance on the Node global object.
 * ================================================================
 */

import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
