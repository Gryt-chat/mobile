import type { SealedAttachmentKey } from "@gryt/crypto";
import { Directory, File, Paths } from "expo-file-system";

import { getServerHttpBase } from "../servers/address";
import { uploadProblem, type Picked } from "./staging";

/**
 * One file to this server's bucket, returning the id a message can carry.
 * Bearer-authenticated with the *server's* access token; the route wants
 * `attach_files`, so a 403 here is a permission answer and not a bug.
 *
 * **It has to be a `Blob`.** React Native 0.86 rejects the `{ uri, type, name }`
 * object every guide shows with "Unsupported FormDataPart implementation".
 * Fetching the `file://` uri gives a blob that is a handle into a native
 * registry, so nothing is copied through JavaScript.
 *
 * **And it has to be `slice`d.** RN's `Blob` has no settable `type` and one
 * from a `file://` fetch has none, so the part goes as
 * `application/octet-stream`, which is not what the server sniffs for.
 */
export async function uploadAttachment(
  host: string,
  token: string,
  file: Picked,
  signal?: AbortSignal,
  /**
   * Encrypt the bytes first, or answer null for "send it as it is" (GRYT-761).
   *
   * Null is the ordinary case — a channel, or a conversation somebody in it is
   * holding up — and the file goes as itself, which is what happened before any
   * of this existed.
   */
  seal?: (
    bytes: Uint8Array,
    about?: { name?: string; mime?: string; width?: number; height?: number },
  ) => { ciphertext: Uint8Array; meta: SealedAttachmentKey } | null,
): Promise<{ fileId: string; meta?: SealedAttachmentKey }> {
  const body = new FormData();
  let sealed: { ciphertext: Uint8Array; meta: SealedAttachmentKey } | null = null;
  let scratch: File | null = null;

  if (seal) {
    const picked = new File(file.uri);
    sealed = seal(picked.bytesSync(), {
      name: file.name,
      mime: file.mime,
      width: file.width,
      height: file.height,
    });
  }

  if (sealed) {
    /* Through a file rather than straight into a `Blob`, for the reason the
     * note above gives from the other direction: React Native's `Blob` cannot
     * be built from bytes. Its polyfill stringifies anything that is not
     * already a `Blob` or a string, so `new Blob([ciphertext])` would upload
     * garbage and say nothing. A `File` *is* a `Blob` here, so writing the
     * bytes and slicing gives a part `FormData` accepts. */
    const dir = new Directory(Paths.cache, "sealed-uploads");
    if (!dir.exists) dir.create({ intermediates: true });

    scratch = new File(dir, `${Date.now()}-${file.name}.enc`);
    scratch.create({ overwrite: true });
    scratch.write(sealed.ciphertext);

    // Nothing the picker knew goes on the wire: no name, no type, no
    // dimensions. All of it is inside `sealed.meta`.
    body.append("file", scratch.slice(0, scratch.size ?? 0, "application/octet-stream"), "sealed.bin");
    body.append("sealed", "1");
  } else {
    const raw = await fetch(file.uri).then((r) => r.blob());
    body.append("file", raw.type ? raw : raw.slice(0, raw.size, file.mime), file.name);

    /* What the picker measured, so the server stores dimensions for a format it
     * cannot measure itself and the message can size the picture before it
     * loads. Omitted rather than sent as zero when the picker did not say. */
    if (file.width && file.height) {
      body.append("width", String(file.width));
      body.append("height", String(file.height));
    }
  }

  let response: Response;
  try {
    response = await fetch(`${getServerHttpBase(host)}/api/uploads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
      signal,
    });
  } finally {
    // On every exit including the ones that threw. A cancelled send would
    // otherwise leave the ciphertext in the cache with nothing to remove it.
    if (scratch?.exists) scratch.delete();
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as
      | { message?: string; error?: string }
      | null;
    throw new Error(uploadProblem(response.status, detail?.message ?? detail?.error));
  }

  const { fileId } = (await response.json()) as { fileId?: string };
  if (!fileId) throw new Error("The server accepted the file without giving it an id.");
  return { fileId, ...(sealed ? { meta: sealed.meta } : null) };
}
