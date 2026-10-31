import type { SealedAttachmentKey } from "@gryt/crypto";
import { File } from "expo-file-system";

import { getServerHttpBase } from "../servers/address";
import { uploadProblem, type Picked } from "./staging";

/**
 * One file to this server's bucket, returning the id a message can carry. Sealed files go
 * as `{ bytes }`, the one shape Expo's fetch takes: RN's `Blob` can't be made from bytes.
 */
export async function uploadAttachment(
  host: string,
  token: string,
  file: Picked,
  signal?: AbortSignal,
  /**
   * Encrypt the bytes first, or answer null for "send it as it is". Null is the
   * ordinary case, and the file goes as itself (GRYT-761).
   */
  seal?: (
    bytes: Uint8Array,
    about?: { name?: string; mime?: string; width?: number; height?: number },
  ) => { ciphertext: Uint8Array; meta: SealedAttachmentKey } | null,
): Promise<{ fileId: string; meta?: SealedAttachmentKey }> {
  const body = new FormData();
  let sealed: { ciphertext: Uint8Array; meta: SealedAttachmentKey } | null = null;

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
    // Nothing the picker knew goes on the wire: no name, no type, no
    // dimensions. All of it is inside `sealed.meta`.
    const { ciphertext } = sealed;
    // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-restricted-types -- FormData's types only know Blob
    body.append("file", { name: "sealed.bin", type: "application/octet-stream", bytes: async () => ciphertext } as unknown as Blob);
    body.append("sealed", "1");
  } else {
    const raw = await fetch(file.uri).then((r) => r.blob());
    body.append("file", raw.type ? raw : raw.slice(0, raw.size, file.mime), file.name);

    /* What the picker measured, so the server stores dimensions for a format it cannot
     * measure and the message can size the picture. Omitted rather than zero. */
    if (file.width && file.height) {
      body.append("width", String(file.width));
      body.append("height", String(file.height));
    }
  }

  const response = await fetch(`${getServerHttpBase(host)}/api/uploads`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
    signal,
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as
      | { message?: string; error?: string }
      | null;
    throw Object.assign(new Error(uploadProblem(response.status, detail?.message ?? detail?.error)), {
      status: response.status,
      retryAfter: response.headers.get("retry-after"),
    });
  }

  const { fileId } = (await response.json()) as { fileId?: string };
  if (!fileId) throw new Error("The server accepted the file without giving it an id.");
  return { fileId, ...(sealed ? { meta: sealed.meta } : null) };
}
