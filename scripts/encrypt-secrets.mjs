#!/usr/bin/env node
// Reads the repo-root .env and writes apps/api/secrets.json with every value
// AES-256-GCM encrypted. The key MUST match apps/api/src/config/load-secrets.ts.
//
// Usage: node scripts/encrypt-secrets.mjs
//        node scripts/encrypt-secrets.mjs --print   # decrypt + print values

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEY = Buffer.from(
  "d5e4bd79231df0e21b0116a2a4334f69888d8d3b4220e02812702b30c14c826d",
  "hex",
);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const outPath = join(root, "apps/api/secrets.json");

// Vars that must never come from the encrypted file (env/platform-owned).
const SKIP = new Set([
  "NODE_ENV",
  "API_PORT",
  "PORT",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
]);

// Values that differ between local dev and the deployed image (which is where
// secrets.json actually takes effect, since local .env wins).
const OVERRIDES = {
  COOKIE_SECURE: "true",
  TRUST_PROXY: "true",
  WEB_ORIGIN: "https://techescape-web.vercel.app",
};

function encrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("hex")).join(":");
}

function decrypt(enc) {
  const [ivHex, tagHex, dataHex] = enc.split(":");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    KEY,
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

if (!existsSync(envPath)) {
  console.error(`No .env at ${envPath}`);
  process.exit(1);
}

const secrets = {};
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  const key = m[1];
  if (SKIP.has(key)) continue;
  let value = m[2].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (!value) continue;
  secrets[key] = encrypt(OVERRIDES[key] ?? value);
}

if (process.argv.includes("--print")) {
  for (const [k, v] of Object.entries(secrets)) {
    console.log(`${k}=${decrypt(v)}`);
  }
  process.exit(0);
}

writeFileSync(outPath, JSON.stringify(secrets, null, 2) + "\n");
console.log(
  `Wrote ${Object.keys(secrets).length} encrypted secrets to ${outPath}`,
);
