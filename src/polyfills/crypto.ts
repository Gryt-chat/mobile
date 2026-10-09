import { getRandomValues } from "expo-crypto";

/*
 * Hermes has no Web Crypto, and @noble and @gryt/crypto draw random bytes from
 * crypto.getRandomValues. Without this, MLS catch-up and device pairing threw on every launch.
 */
const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (typeof g.crypto?.getRandomValues !== "function") {
  g.crypto = { ...(g.crypto ?? {}), getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
    if (array) getRandomValues(array as unknown as Uint8Array);
    return array;
  } };
}
