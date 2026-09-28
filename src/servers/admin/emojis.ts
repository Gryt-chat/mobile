/**
 * The parts of emoji management that touch neither a socket nor a file — kept in
 * step with `EMOJI_NAME_RE` and `deriveEmojiName` in the server's `emojiShared.ts`.
 */

export interface EmojiItem {
  name: string;
  file_id: string;
}

export const EMOJI_NAME_RE = /^[A-Za-z0-9_]{2,32}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isEmojiItem(v: unknown): v is EmojiItem {
  if (!isRecord(v)) return false;
  return typeof v.name === "string" && typeof v.file_id === "string";
}

/** What a picked file's name becomes if nobody edits it: letters, numbers and
    underscores, 2 to 32 of them, padded or truncated to fit. */
export function deriveEmojiName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/^\d+[-_]/, "");
  const sanitized = base.replace(/[^A-Za-z0-9_]/g, "_");
  const trimmed = sanitized.replace(/^_+|_+$/g, "").replace(/_{2,}/g, "_");
  if (trimmed.length < 2) return trimmed.padEnd(2, "_");
  return trimmed.slice(0, 32);
}

/** What a typed name becomes as it is typed: the server's own alphabet, live. */
export function sanitizeTypedName(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 32);
}

export function isValidEmojiName(name: string): boolean {
  return EMOJI_NAME_RE.test(name);
}

/** Where the server draws one, and where the phone's own upload path posts a new
    one — both under `/api/emojis`, the route this server exposes with no auth on the read. */
export function emojiImageUrl(base: string, name: string): string {
  return `${base}/api/emojis/img/${encodeURIComponent(name)}`;
}
