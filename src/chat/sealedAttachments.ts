import type { SealedAttachmentKey } from "@gryt/crypto";
import { Directory, File, Paths } from "expo-file-system";

export { sealedAttachmentMeta } from "./files";

/**
 * Turning an encrypted upload back into something the message list can draw
 * (GRYT-761). The server holds ciphertext with no name and no dimensions;
 * everything needed to draw it came back inside the sealed message.
 *
 * **A file rather than a blob URL, because React Native has neither.**
 * `URL.createObjectURL` does not exist and the `Blob` polyfill stringifies
 * anything that is not already a `Blob` or a string, so `new Blob([bytes])`
 * produces garbage silently rather than failing.
 *
 * **So decrypted bytes are on disk**, in this app's private cache.
 * `forgetSealed` deletes them when the conversation closes rather than leaving
 * it to the OS.
 */

/** Where decrypted attachments go, kept together so they can be dropped. */
function sealedCache(): Directory {
  const dir = new Directory(Paths.cache, "sealed-attachments");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Download one attachment, open it, and put the result where an `Image` can
 * reach it.
 *
 * `File.downloadFileAsync` rather than `fetch(...).arrayBuffer()`, because
 * React Native's `fetch` gives an unreliable `arrayBuffer` and this is a whole
 * photograph. The ciphertext lands in the cache, is read as bytes, and is
 * deleted — only the plaintext stays, under a name derived from the file id so
 * a second look at the same conversation reuses it.
 */
export async function materialiseSealedAttachment({
  url,
  fileId,
  key,
  openFile,
}: {
  url: string;
  fileId: string;
  key: SealedAttachmentKey;
  openFile: (ciphertext: Uint8Array, meta: SealedAttachmentKey) => Uint8Array;
}): Promise<string> {
  const dir = sealedCache();
  const plain = new File(dir, fileId);

  // Already opened once this session. Reading it again would cost a download
  // and a decrypt for bytes that are sitting right there.
  if (plain.exists) return plain.uri;

  const encrypted = new File(dir, `${fileId}.enc`);
  try {
    await File.downloadFileAsync(url, encrypted, { idempotent: true });
    const opened = openFile(encrypted.bytesSync(), key);

    plain.create({ overwrite: true });
    plain.write(opened);
    return plain.uri;
  } finally {
    // The ciphertext is no use once it has been opened, and leaving it doubles
    // what this costs on disk.
    if (encrypted.exists) encrypted.delete();
  }
}

/**
 * Drop every decrypted attachment.
 *
 * Called when the conversation goes away. The OS would eventually clear the
 * cache under pressure, which is not the same as this app deciding it no longer
 * needs somebody's photographs sitting in plaintext.
 */
export function forgetSealedAttachments(): void {
  const dir = new Directory(Paths.cache, "sealed-attachments");
  if (dir.exists) dir.delete();
}
