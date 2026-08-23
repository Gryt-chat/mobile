import { MAX_ATTACHMENTS, pickedFrom, type Picked } from "../chat/staging";

/**
 * What another app handed us, turned into what the composer already sends.
 *
 * The two platforms deliver a share in completely different shapes — Android as
 * Intent extras, iOS as items in an extension's context — and neither is worth
 * carrying into the app. `modules/share-intent` flattens both to the same
 * `RawShare`, and this turns that into the pair the send path takes: some text,
 * and some files as `Picked`.
 *
 * **Reusing `pickedFrom` is the point.** A shared file arrives the same way a
 * picked one does — often a `content://` uri with no name and no mime, because
 * the app that sent it did not bother — and `staging.ts` already knows how to
 * guess both. Writing a second guesser here would be a second set of rules to
 * keep in step with the upload route.
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
 * Null when there is nothing to send.
 *
 * Worth being strict about: both platforms will hand over an empty share in
 * ordinary circumstances — an Android cold start reads the launch Intent
 * whether or not it was a share, and the iOS stash is read on every foreground
 * — so "nothing here" is the common case rather than an error, and it has to be
 * distinguishable from a share of an empty string.
 */
export function normalizeShare(raw: RawShare | null | undefined): IncomingShare | null {
  if (!raw) return null;

  const text = typeof raw.text === "string" && raw.text.trim() ? raw.text.trim() : null;

  const files = (Array.isArray(raw.files) ? raw.files : [])
    .filter((file): file is RawFile => Boolean(file && typeof file.uri === "string" && file.uri))
    /* Through the picker's own normaliser, so a share and a pick reach the
     * upload route as the same thing. `null` is spelled `undefined` on the way
     * in because that is what `PickerAsset` uses. */
    .map((file) =>
      pickedFrom({
        uri: file.uri,
        fileName: file.name ?? undefined,
        mimeType: file.mime ?? undefined,
        width: file.width ?? undefined,
        height: file.height ?? undefined,
      }),
    )
    /* The same cap the composer has, and for the same reason: they upload one
     * at a time, and somebody selecting forty photos in Files should get a
     * refusal rather than a progress bar that never ends. */
    .slice(0, MAX_ATTACHMENTS);

  if (!text && files.length === 0) return null;
  return { text, files };
}

/**
 * How many were dropped by the cap, for the sentence that says so.
 *
 * Silently sending four of somebody's forty pictures is the kind of thing that
 * is only discovered by the person on the other end.
 */
export function droppedCount(raw: RawShare | null | undefined): number {
  const total = Array.isArray(raw?.files)
    ? raw.files.filter((file) => file && typeof file.uri === "string" && file.uri).length
    : 0;
  return Math.max(0, total - MAX_ATTACHMENTS);
}
