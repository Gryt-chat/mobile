import { parsePairingCode, parsePairingQr } from "@gryt/crypto";

/** What the camera saw: a link code to claim, a newer one to refuse, or anything else to skip. */
export type ScanVerdict = "claim" | "newer_version" | "ignore";

export function judgeScan(text: string): ScanVerdict {
  const qr = parsePairingQr(text.trim());
  if (qr.ok) return "claim";
  return qr.reason === "newer-version" ? "newer_version" : "ignore";
}

/** Typed text as `XXXX-XXXX` while it's being typed: upper case, no stray characters, eight at most. */
export function formatCodeInput(text: string): string {
  const clean = text.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

/** Whether Continue can go: a full code the relay could know. */
export function isCompleteCode(text: string): boolean {
  return parsePairingCode(text) !== null;
}
