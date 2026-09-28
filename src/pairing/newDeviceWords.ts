import type { PairingEndReason } from "@gryt/core";

/* What the phone says while it's being linked. Worded as docs/pairing-design.md section 7,
   which the desktop follows too. */

export const SCAN_THIS =
  "Open Gryt on a device where you're already signed in, go to Link a new device in its settings, and scan this.";

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
    default:
      return "Linking stopped, and nothing was kept. Try again.";
  }
}

export const REPLACES_IDENTITY =
  "This phone takes its identity from the other device. Servers you joined here as a guest will see you as somebody new.";
