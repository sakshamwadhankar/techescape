#!/usr/bin/env node
// Deletes game sessions, actions, and Redis game state for synthetic load
// teams, so a load test starts from a clean slate. Scoped to teams whose
// accessCode starts with the given prefix — real teams are never touched.
//
// Usage:
//   node scripts/load/reset-sessions.mjs [--prefix load] [--dry-run]

import { readFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const env = readFileSync(join(root, ".env"), "utf8");
const get = (k) => (env.match(new RegExp(`^${k}="?([^"\\n]+)"?$`, "m")) || [])[1];
process.env.DATABASE_URL = get("DATABASE_URL");

const require = createRequire(join(root, "apps/api/package.json"));
const { prisma } = require("@spiderman/db");
const Redis = require("ioredis");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};

const prefix = flag("--prefix", "load");
const dryRun = args.includes("--dry-run");

const teams = await prisma.team.findMany({
  where: { accessCode: { startsWith: `${prefix}-` } },
  select: { id: true },
});
const sessionIds = (
  await prisma.gameSession.findMany({ where: { teamId: { in: teams.map((t) => t.id) } }, select: { id: true } })
).map((s) => s.id);

let keys = [];
if (!dryRun) {
  const redis = new Redis(get("REDIS_URL"), { lazyConnect: true, maxRetriesPerRequest: 1 });
  await redis.connect();
  for (const sid of sessionIds) {
    keys.push(
      ...(await redis.keys(`state:${sid}:*`)),
      ...(await redis.keys(`idem:${sid}:*`)),
      ...(await redis.keys(`lock:${sid}*`)),
    );
  }
  if (keys.length) await redis.del(...keys);
  await redis.quit();

  if (sessionIds.length) {
    await prisma.gameAction.deleteMany({ where: { sessionId: { in: sessionIds } } });
    await prisma.gameSession.deleteMany({ where: { id: { in: sessionIds } } });
  }
}

await prisma.$disconnect();
console.log(`reset-sessions: prefix=${prefix} sessions=${sessionIds.length} redis-keys=${keys.length}${dryRun ? " (dry-run)" : ""}`);
