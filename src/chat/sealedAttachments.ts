import type { SealedAttachmentKey } from "@gryt/crypto";
import { Directory, File, Paths } from "expo-file-system";

export { sealedAttachmentMeta } from "./files";

/**
 * Turning an encrypted upload into something the message list can draw. A file, since
 * React Native has no blob URL — so decrypted bytes are on disk until `forgetSealed`.
 */

/** Where decrypted attachments go, kept together so they can be dropped. */
function sealedCache(): Directory {
  const dir = new Directory(Paths.cache, "sealed-attachments");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Download one attachment, open it, and put the result where an `Image` can reach it.
 * `File.downloadFileAsync`, because RN's `fetch` gives an unreliable `arrayBuffer`.
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
 * Drop every decrypted attachment, when the conversation goes away. The OS clearing the
 * cache under pressure is not the same as this app deciding it is done with them.
 */
export function forgetSealedAttachments(): void {
  const dir = new Directory(Paths.cache, "sealed-attachments");
  if (dir.exists) dir.delete();
}
