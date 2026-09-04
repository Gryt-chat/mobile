/* Byte helpers the app needs that are not base64.
 *
 * `base64Url` and `base64UrlDecode` moved to `@gryt/crypto` (GRYT-898). This
 * file's copy was byte-identical to the one that package has shipped since it
 * was written, and the reason both existed is that crypto never exported it.
 *
 * Re-exported here so the files importing from `@/identity/encoding` do not all
 * have to move.
 */

export { base64Url, base64UrlDecode } from "@gryt/crypto";

export function utf8(value: string): Uint8Array {
  // TextEncoder exists in Hermes and is the only thing here that needs to
  // handle more than ASCII — a nickname can be anything.
  return new TextEncoder().encode(value);
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Odd-length hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error("Not hex");
    out[i] = byte;
  }
  return out;
}
