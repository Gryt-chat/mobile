import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { openPreview } from "./previewOpen";

const TAG = "0123456789abcdef";
const b64url = (b: Buffer) => b.toString("base64url");

// Sealed the way the server's pushPreview.ts does it, so a change on either side shows up here.
function seal(plain: object, key: Buffer, tag = TAG, version = 1): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(`gryt-push-1|${tag}`));
  const body = Buffer.concat([cipher.update(JSON.stringify(plain)), cipher.final()]);
  return b64url(Buffer.concat([Buffer.from([version]), nonce, body, cipher.getAuthTag()]));
}

describe("openPreview", () => {
  const key = randomBytes(32);

  it("opens what the server sealed", () => {
    const blob = seal({ t: "Kari", s: "#general · Gryt", b: "Anyone up tonight?" }, key);
    expect(openPreview(blob, TAG, b64url(key))).toEqual({ t: "Kari", s: "#general · Gryt", b: "Anyone up tonight?" });
  });

  it("refuses a different server's tag, key or version", () => {
    const blob = seal({ t: "Kari", b: "hi" }, key);
    expect(openPreview(blob, "fedcba9876543210", b64url(key))).toBeNull();
    expect(openPreview(blob, TAG, b64url(randomBytes(32)))).toBeNull();
    expect(openPreview(seal({ t: "Kari", b: "hi" }, key, TAG, 2), TAG, b64url(key))).toBeNull();
  });

  it("refuses something that isn't a preview at all", () => {
    expect(openPreview("not base64url!", TAG, b64url(key))).toBeNull();
    expect(openPreview(seal({ b: "no title" }, key), TAG, b64url(key))).toBeNull();
    expect(openPreview(seal({ t: "Kari", b: "hi" }, key), TAG, "short")).toBeNull();
  });
});
