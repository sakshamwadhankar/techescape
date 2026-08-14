import { createDecipheriv } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Obfuscation key shared with scripts/encrypt-secrets.mjs — keep them in sync.
// This is NOT real secret storage: the key ships inside the image. Its purpose
// is to avoid committing plaintext credentials to the repo, not to stop someone
// with image access from recovering the values.
const KEY = Buffer.from(
  "d5e4bd79231df0e21b0116a2a4334f69888d8d3b4220e02812702b30c14c826d",
  "hex",
);

export function decryptSecret(enc: string): string {
  const parts = enc.split(":");
  if (parts.length !== 3) throw new Error("malformed secret payload");
  const [ivHex, tagHex, dataHex] = parts as [string, string, string];
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

export function loadSecrets(): void {
  const candidates = [
    join(__dirname, "../../secrets.json"),
    join(__dirname, "../secrets.json"),
    join(__dirname, "secrets.json"),
  ];
  const file = candidates.find((p) => existsSync(p));
  if (!file) return;

  let records: Record<string, string>;
  try {
    records = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    console.warn(`[secrets] could not parse ${file}; ignoring`);
    return;
  }

  for (const [key, enc] of Object.entries(records)) {
    if (process.env[key] != null) continue;
    try {
      process.env[key] = decryptSecret(enc);
    } catch {
      console.warn(`[secrets] failed to decrypt ${key} from ${file}`);
    }
  }
}
