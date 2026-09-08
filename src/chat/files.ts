import type { SealedAttachmentKey } from "@gryt/crypto";

import { getFileToken } from "../connection/fileToken";
import { getServerHttpBase } from "../servers/address";
import type { Message } from "../connection/types";

export type Attachment = NonNullable<Message["enriched_attachments"]>[number];

/**
 * Where an uploaded file lives — the server streams the object through its own API. The
 * token is in the query string, since this ends up in an `Image source` (GRYT-740).
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
 * What the list should show for one decrypted attachment. **`has_thumbnail` is false
 * and cannot be otherwise.** `mime` and `original_name` are the sender's, unverified.
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
 * Where to point an `Image` for one attachment — the decrypted copy when there is one.
 * **`thumb` is ignored for a sealed one**: there is not one, and asking would 404.
 */
export function attachmentSource(
  host: string,
  attachment: Attachment,
  thumb = false,
): string {
  return attachment.local_uri ?? attachmentUrl(host, attachment.file_id, thumb);
}

/**
 * Whether to draw the thing or describe it. **On the mime the server sniffed, not the
 * file name.** Missing mime means not an image: a broken picture is worse than a card.
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
 * How big to draw an image. The server reports the real dimensions, so the box is the
 * right shape before a byte arrives. Capped in height too.
 */
export function imageBox(
  attachment: Attachment,
  available: number,
  maxHeight = 320,
): { width: number; height: number } {
  const width = attachment.width ?? 0;
  const height = attachment.height ?? 0;

  /* No dimensions is the ordinary case for an older upload. A 4:3 guess reserves
   * roughly the right room, which beats collapsing and jumping. */
  if (width <= 0 || height <= 0) {
    const w = Math.min(available, 260);
    return { width: w, height: Math.round((w * 3) / 4) };
  }

  const scale = Math.min(available / width, maxHeight / height, 1);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
