/* base64url, without `btoa`.
 *
 * Hermes has `btoa`, and it is fed a string built one `String.fromCharCode` at
 * a time from bytes — which is fine until a byte is above 0x7f and the engine's
 * idea of a "binary string" and yours stop agreeing. Everything here is bytes
 * in and ASCII out, so there is nothing to disagree about.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function base64Url(bytes: Uint8Array): string {
  let out = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const c = i + 2 < bytes.length ? bytes[i + 2] : undefined;

    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 0x03) << 4) | ((b ?? 0) >> 4)];
    if (b === undefined) break;
    out += ALPHABET[((b & 0x0f) << 2) | ((c ?? 0) >> 6)];
    if (c === undefined) break;
    out += ALPHABET[c & 0x3f];
  }

  // No padding, which is what base64url in a JWT means.
  return out;
}

export function base64UrlDecode(value: string): Uint8Array {
  const lookup = new Map<string, number>();
  for (let i = 0; i < ALPHABET.length; i++) lookup.set(ALPHABET[i], i);

  const clean = value.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8));

  let bits = 0;
  let value_ = 0;
  let written = 0;

  for (const ch of clean) {
    const digit = lookup.get(ch);
    if (digit === undefined) throw new Error("Not base64url");
    value_ = (value_ << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[written++] = (value_ >> bits) & 0xff;
    }
  }

  return out.subarray(0, written);
}

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
