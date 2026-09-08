import { MAX_ATTACHMENTS, pickedFrom, type Picked } from "../chat/staging";

/**
 * What another app handed us, turned into what the composer already sends.
 * **Reusing `pickedFrom` is the point** — a shared file arrives like a picked one, and
 * a second guesser is a second set of rules to keep in step.
 */

/** One file as the native side reports it. Everything but the uri is optional. */
export interface RawFile {
  uri: string;
  mime?: string | null;
  name?: string | null;
  width?: number | null;
  height?: number | null;
}

/** A share, flattened. Either half can be missing; both missing is not a share. */
export interface RawShare {
  text?: string | null;
  files?: RawFile[] | null;
}

export interface IncomingShare {
  /** Message text, or null when only files were shared. */
  text: string | null;
  files: Picked[];
}

/**
 * Null when there is nothing to send. **Both platforms hand over an empty share in
 * ordinary circumstances**, so this is the common case.
 */
export function normalizeShare(raw: RawShare | null | undefined): IncomingShare | null {
  if (!raw) return null;

  const text = typeof raw.text === "string" && raw.text.trim() ? raw.text.trim() : null;

  const files = (Array.isArray(raw.files) ? raw.files : [])
    .filter((file): file is RawFile => Boolean(file && typeof file.uri === "string" && file.uri))
    /* Through the picker's own normaliser, so a share and a pick reach the upload
     * route as the same thing. `null` is `undefined` on the way in. */
    .map((file) =>
      pickedFrom({
        uri: file.uri,
        fileName: file.name ?? undefined,
        mimeType: file.mime ?? undefined,
        width: file.width ?? undefined,
        height: file.height ?? undefined,
      }),
    )
    /* The same cap the composer has: they upload one at a time, and forty photos
     * should get a refusal rather than a progress bar that never ends. */
    .slice(0, MAX_ATTACHMENTS);

  if (!text && files.length === 0) return null;
  return { text, files };
}

/**
 * How many were dropped by the cap, for the sentence that says so. Silently sending
 * four of somebody's forty pictures is only discovered by the other end.
 */
export function droppedCount(raw: RawShare | null | undefined): number {
  const total = Array.isArray(raw?.files)
    ? raw.files.filter((file) => file && typeof file.uri === "string" && file.uri).length
    : 0;
  return Math.max(0, total - MAX_ATTACHMENTS);
}
