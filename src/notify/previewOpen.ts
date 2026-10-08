import { gcm } from "@noble/ciphers/aes.js";

/** What a server seals into a push: who wrote, where, and the first line (GRYT-1688). */
export interface Preview {
  t: string;
  s?: string;
  b: string;
}

function fromBase64url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * 0x01 | nonce (12) | ciphertext | tag (16), AES-256-GCM with "gryt-push-1|<tag>" as additional
 * data. The same format the iPhone's extension opens. Null for anything it can't open.
 */
export function openPreview(blob: string, tag: string, key: string): Preview | null {
  const raw = fromBase64url(blob);
  const secret = fromBase64url(key);
  if (!raw || !secret || secret.length !== 32 || raw.length <= 29 || raw[0] !== 1) return null;
  try {
    const aad = new TextEncoder().encode(`gryt-push-1|${tag}`);
    const plain = gcm(secret, raw.subarray(1, 13), aad).decrypt(raw.subarray(13));
    const value = JSON.parse(new TextDecoder().decode(plain)) as Partial<Preview>;
    if (typeof value.t !== "string" || typeof value.b !== "string") return null;
    return { t: value.t, b: value.b, ...(typeof value.s === "string" ? { s: value.s } : {}) };
  } catch {
    return null;
  }
}
