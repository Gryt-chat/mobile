/**
 * Turning what the picker hands back into something the server will take.
 *
 * Pure, because every interesting case here is a missing field rather than a
 * network call: the picker's `fileName` and `mimeType` are both optional and
 * both are routinely absent on Android, where an asset comes back as a
 * `content://` uri with nothing else attached. A name of `undefined` reaches
 * the server as the literal string, and a missing mime is sent as
 * `application/octet-stream` — which the upload route accepts and then stores
 * as a file nothing will draw.
 */

/** One file, ready to be uploaded. */
export interface Picked {
  uri: string;
  mime: string;
  name: string;
  /** What the picker measured, so the row can size the image before it loads. */
  width?: number;
  height?: number;
}

/** The shape `expo-image-picker` returns, narrowed to what is used. */
export interface PickerAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  width?: number;
  height?: number;
  type?: string | null;
}

/**
 * How many can be staged at once.
 *
 * The server takes one file per request and the composer uploads them in turn,
 * so this is about the wait rather than about a limit anybody imposed: ten
 * pictures on a phone connection is long enough that the send looks stuck.
 */
export const MAX_ATTACHMENTS = 4;

/**
 * A best guess at the mime type, which is better than none.
 *
 * The extension is the fallback rather than the first choice: it is whatever
 * the sending device felt like, and the picker's own `mimeType` is what the
 * platform actually sniffed. Both missing means an image, because that is what
 * the picker was opened for.
 */
export function mimeOf(asset: PickerAsset): string {
  if (asset.mimeType) return asset.mimeType;

  const extension = /\.([a-z0-9]+)(?:\?|$)/i.exec(asset.uri)?.[1]?.toLowerCase();
  switch (extension) {
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "heic":
    case "heif":
      return "image/heic";
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    default:
      return asset.type === "video" ? "video/mp4" : "image/jpeg";
  }
}

/**
 * A file name, made up if there is not one.
 *
 * It is what the message shows for anything that is not a picture, and it is
 * what the server derives an extension from — so `undefined.jpg` is not a
 * cosmetic problem.
 */
export function nameOf(asset: PickerAsset, mime: string): string {
  if (asset.fileName) return asset.fileName;

  /* The last path segment, when the uri has one worth using. An Android
   * `content://media/external/images/media/1000000034` does not. */
  const tail = asset.uri.split("/").pop() ?? "";
  if (/\.[a-z0-9]+$/i.test(tail)) return tail;

  const extension = mime.split("/")[1]?.replace("quicktime", "mov") ?? "bin";
  return `upload.${extension}`;
}

export function pickedFrom(asset: PickerAsset): Picked {
  const mime = mimeOf(asset);
  return {
    uri: asset.uri,
    mime,
    name: nameOf(asset, mime),
    width: asset.width,
    height: asset.height,
  };
}

/**
 * What to say when the server refuses one.
 *
 * The two that actually happen get their own sentence, because "Upload failed
 * (413)" tells somebody nothing they can act on. Everything else falls through
 * to whatever the server said, which is usually better than a guess.
 */
export function uploadProblem(status: number, message?: string): string {
  if (status === 413) return "That file is too big for this server.";
  if (status === 403) return "You are not allowed to attach files here.";
  return message || `The server refused it (${status}).`;
}
