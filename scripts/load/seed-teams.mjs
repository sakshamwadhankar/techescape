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

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};

const count = parseInt(flag("--count", "1000"), 10);
const prefix = flag("--prefix", "load");

if (!Number.isFinite(count) || count < 1 || count > 5000) {
  throw new Error("--count must be an integer in [1, 5000]");
}

const pad = String(count).length;
const teams = Array.from({ length: count }, (_, i) => {
  const n = String(i + 1).padStart(pad, "0");
  const accessCode = `${prefix}-${n}`;
  return { accessCode, code: `${prefix}-${n}`, name: `${prefix}-team-${n}`, memberNames: [] };
});

const created = await prisma.team.createMany({ data: teams, skipDuplicates: true });
const existing = await prisma.team.count({ where: { accessCode: { startsWith: `${prefix}-` } } });

await prisma.$disconnect();
console.log(`seed-teams: prefix=${prefix} requested=${count} inserted=${created.count} present=${existing - created.count}`);
