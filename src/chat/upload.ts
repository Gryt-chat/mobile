import { getServerHttpBase } from "../servers/address";
import { uploadProblem, type Picked } from "./staging";

/**
 * One file to this server's bucket, returning the id a message can carry.
 *
 * `POST /api/uploads`, bearer-authenticated with the *server's* access token
 * rather than the account's — the same one `chat:send` carries. The route wants
 * `attach_files`, so a 403 here is a permission answer and not a bug.
 *
 * **The part that is not obvious is the `Blob`.** React Native 0.86 rejects the
 * `{ uri, type, name }` object every guide still shows with "Unsupported
 * FormDataPart implementation" — `FormData` follows the spec now and wants a
 * `Blob` or a string. Fetching the `file://` uri gives one, and does *not* copy
 * the picture through JavaScript: its `Blob` is a handle into a native
 * registry, so this stays a reference until the request body is assembled.
 *
 * **And the `slice`.** React Native's `Blob` has no settable `type`, and the one
 * that comes back from a `file://` fetch has none. An untyped part is sent as
 * `application/octet-stream`, which is not what the server sniffs for. `slice`
 * is the only way to stamp a type onto an existing blob. The avatar upload
 * learned both of these the hard way; this is the same lesson, applied to the
 * other route.
 */
export async function uploadAttachment(
  host: string,
  token: string,
  file: Picked,
  signal?: AbortSignal,
): Promise<string> {
  const raw = await fetch(file.uri).then((r) => r.blob());
  const body = new FormData();
  body.append("file", raw.type ? raw : raw.slice(0, raw.size, file.mime), file.name);

  /* What the picker measured, so the server stores dimensions for a format it
   * cannot measure itself and the message can size the picture before it
   * loads. Omitted rather than sent as zero when the picker did not say. */
  if (file.width && file.height) {
    body.append("width", String(file.width));
    body.append("height", String(file.height));
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
    throw new Error(uploadProblem(response.status, detail?.message ?? detail?.error));
  }

  const { fileId } = (await response.json()) as { fileId?: string };
  if (!fileId) throw new Error("The server accepted the file without giving it an id.");
  return fileId;
}
