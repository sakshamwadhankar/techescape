import { createCipheriv, randomBytes } from "node:crypto";
import { decryptSecret } from "./load-secrets";

const KEY = Buffer.from(
  "d5e4bd79231df0e21b0116a2a4334f69888d8d3b4220e02812702b30c14c826d",
  "hex",
);

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString("hex"))
    .join(":");
}

describe("load-secrets", () => {
  it("decrypts a payload produced by the encrypt script format", () => {
    const payload = encrypt("postgresql://user:pass@host/db");
    expect(decryptSecret(payload)).toBe("postgresql://user:pass@host/db");
  });

  it("rejects a payload with the wrong key", () => {
    const payload = encrypt("secret");
    expect(() => decryptSecret(payload.slice(0, -4) + "0000")).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => decryptSecret("not-a-valid-payload")).toThrow(
      "malformed secret payload",
    );
  });
});
