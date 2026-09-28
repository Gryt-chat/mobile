import type { ArchiveKeyErrorCode } from "../archive/archiveKey";

/** What's wrong when the archive won't open. The desktop's words, with "on this phone". */
export function localHistoryProblemText(code: ArchiveKeyErrorCode | null): string {
  switch (code) {
    case "unseal-failed":
      return "This phone's keychain didn't let Gryt open its local history. Unlock your phone, then try again.";
    case "mismatch":
      return "Your local history doesn't match the key on this phone, so it won't open.";
    case "damaged":
      return "The key to your local history on this phone is damaged, so it won't open.";
    default:
      return "Gryt couldn't open your local history on this phone.";
  }
}

/** Try again asks the keychain again and deletes nothing. It can't help a key that's wrong. */
export function canRetryLocalHistory(code: ArchiveKeyErrorCode | null): boolean {
  return code === "unseal-failed" || code === null;
}

export const CLEAR_LOCAL_HISTORY = "Clear local history on this device";
export const CLEAR_CONFIRM_TITLE = "Clear local history on this device?";
export const CLEAR_CONFIRM_TEXT =
  "Messages this device already decrypted will be gone for good. Messages from the last 30 days that are still on the server can't be read here either, because their keys go too. After that, this device starts over with new keys. The other person's app adds it back to each conversation by itself.";
