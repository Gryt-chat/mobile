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
 * The route takes no auth — same as `/icon` — so an `Image` can be pointed
 * straight at it. Worth knowing rather than assuming: it means anyone with a
 * file id can read the file.
 */
export function attachmentUrl(host: string, fileId: string, thumb = false): string {
  return `${getServerHttpBase(host)}/api/uploads/files/${fileId}${thumb ? "?thumb=1" : ""}`;
}

/**
 * Whether to draw the thing or describe it.
 *
 * Decided on the mime type the server reports rather than on the file name,
 * because the extension is whatever the uploader's device felt like and the
 * mime is what the server actually sniffed. Missing mime means "not an image":
 * drawing a broken picture is worse than showing an honest card.
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
 * How big to draw an image, given the room available.
 *
 * The server reports the real dimensions, so the box can be the right shape
 * before a single byte of the picture arrives — no reflow when it lands, which
 * on a list that is scrolling is the difference between reading and chasing.
 *
 * Capped in height as well as width, because a tall narrow photo would
 * otherwise take the whole screen and push the next message off it.
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
