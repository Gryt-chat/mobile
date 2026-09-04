import type { SealedAttachmentKey } from "@gryt/crypto";

import { getFileToken } from "../connection/fileToken";
import { getServerHttpBase } from "../servers/address";
import type { Message } from "../connection/types";

export type Attachment = NonNullable<Message["enriched_attachments"]>[number];

/**
 * Where an uploaded file lives.
 *
 * Same shape as the desktop's `getUploadsFileUrl`, and the same route: the
 * server streams the object through its own API rather than redirecting to S3,
 * because in development the bucket is usually on a localhost nothing else can
 * reach.
 *
 * The route needs a token now — it used to serve anything to anyone holding a
 * file id, forever (GRYT-740). It goes in the query string because this string
 * ends up in an `Image source`, which carries no headers of ours.
 *
 * Without a token the URL is still returned. The server answers 401 and the
 * picture fails, which is what an expired token does too, and is better than
 * every caller having to decide what to render instead.
 */
export function attachmentUrl(host: string, fileId: string, thumb = false): string {
  const params = new URLSearchParams();
  if (thumb) params.set("thumb", "1");
  const token = getFileToken(host);
  if (token) params.set("t", token);
  const q = params.toString();
  return `${getServerHttpBase(host)}/api/uploads/files/${fileId}${q ? `?${q}` : ""}`;
}

/**
 * What the list should show for one decrypted attachment. **`has_thumbnail` is
 * false and cannot be otherwise** — a thumbnail is made by decoding the picture
 * and the server was handed noise (GRYT-764). `mime` and `original_name` are
 * the sender's, from inside the envelope, and nothing verifies them.
 */
export function sealedAttachmentMeta(
  fileId: string,
  key: SealedAttachmentKey,
  localUri: string,
): Attachment {
  return {
    file_id: fileId,
    mime: key.mime ?? "application/octet-stream",
    size: key.size,
    original_name: key.name,
    width: key.width,
    height: key.height,
    has_thumbnail: false,
    local_uri: localUri,
  };
}

/**
 * Where to point an `Image` for one attachment (GRYT-761) — the decrypted copy
 * when there is one, since the ordinary url is ciphertext and draws a broken
 * picture. **`thumb` is ignored for a sealed one**: there is not one, and
 * asking would 404 (GRYT-764).
 */
export function attachmentSource(
  host: string,
  attachment: Attachment,
  thumb = false,
): string {
  return attachment.local_uri ?? attachmentUrl(host, attachment.file_id, thumb);
}

/**
 * Whether to draw the thing or describe it. **On the mime the server sniffed,
 * not the file name**, which is whatever the uploader's device felt like.
 * Missing mime means not an image: a broken picture is worse than a card.
 */
export function isImage(attachment: Attachment): boolean {
  return typeof attachment.mime === "string" && attachment.mime.startsWith("image/");
}

/** `1.4 MB`, or nothing when the server did not say. */
export function readableSize(bytes: number | undefined): string | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/**
 * How big to draw an image. The server reports the real dimensions, so the box
 * is the right shape before a byte arrives — no reflow mid-scroll. Capped in
 * height too, or a tall photo pushes the next message off the screen.
 */
export function imageBox(
  attachment: Attachment,
  available: number,
  maxHeight = 320,
): { width: number; height: number } {
  const width = attachment.width ?? 0;
  const height = attachment.height ?? 0;

  /* No dimensions is the ordinary case for an older upload. A 4:3 box is a
   * guess, but a guess that reserves roughly the right amount of room beats
   * collapsing to nothing and jumping when the image loads. */
  if (width <= 0 || height <= 0) {
    const w = Math.min(available, 260);
    return { width: w, height: Math.round((w * 3) / 4) };
  }

  const scale = Math.min(available / width, maxHeight / height, 1);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
