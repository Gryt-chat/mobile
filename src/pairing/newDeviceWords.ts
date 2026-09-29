import type { HistoryProgress, PairingEndReason } from "@gryt/core";

/* What the phone says while it's being linked. Worded as docs/pairing-design.md section 7,
   which the desktop follows too. */

export const SCAN_THIS =
  "Open Gryt on a device you already use, go to Link a new device in its settings, and scan this.";

/** Under the QR when it was swapped for a new one. Null when there's nothing to say. */
export function renewedText(renewed: "expired" | "timed_out" | undefined): string | null {
  return renewed === "timed_out" ? "The other device didn't approve in time, so this is a new code." : null;
}

/** Why a link stopped, on the phone being linked. Null when the person cancelled it themselves. */
export function newDeviceEndText(reason: PairingEndReason): string | null {
  switch (reason) {
    case "cancelled":
      return null;
    case "cancelled_by_other":
      return "Cancelled on the other device. Nothing was kept.";
    case "mismatch":
      return "Nothing was kept. If the emoji really were different, somebody may have got in between the two devices. Try again.";
    case "tampered":
      return "Something the other device sent didn't check out, so nothing was kept. Try again.";
    case "wrong_account":
      return "The sign-in came back as a different account from the one the other device sent, so nothing was kept.";
    case "sign_in_failed":
      return "Signing in didn't finish, so nothing was kept. Try again.";
    case "newer_version":
      return "The other device has a newer version of Gryt. Update this app and try again.";
    case "rate_limited":
      return "Too many tries from this network. Wait a while and try again.";
    case "relay_error":
      return "Couldn't reach Gryt's linking service. Check your connection and try again.";
    case "history_failed":
      return "You're linked, but this device couldn't save your message history. Link again from the other device to get it.";
    case "access_denied":
      return "The sign-in was turned down, so nothing was kept. Try again.";
    case "expired_token":
      return "The sign-in ran out before the other device approved it, so nothing was kept. Try again.";
    default:
      return "Linking stopped, and nothing was kept. Try again.";
  }
}

export const REPLACES_IDENTITY =
  "This phone takes its identity from the other device. Servers you joined here as a guest will see you as somebody new.";

/** While the history comes in, under the progress bar. */
export function gettingHistoryText(progress: HistoryProgress): string {
  // The total counts the snapshot; the tail can add a few more on top of it.
  return progress.total === null
    ? `Getting your message history: ${progress.messages} so far`
    : `Getting your message history: ${progress.messages} of ${Math.max(progress.total, progress.messages)}`;
}

/** Once it's in: how far back it goes, and what didn't make it. Empty when there's nothing to say. */
export function gotHistoryLines(progress: HistoryProgress, date: (at: number) => string): string[] {
  const lines: string[] = [];
  if (progress.messages > 0 && progress.oldest !== null) {
    lines.push(
      progress.truncated
        ? `The oldest messages didn't fit, so your history starts on ${date(progress.oldest)}.`
        : `Your message history goes back to ${date(progress.oldest)}.`,
    );
  }
  const lost = progress.missing + progress.refused;
  if (lost > 0) lines.push(`${lost} batches of messages couldn't be downloaded.`);
  return lines;
}
