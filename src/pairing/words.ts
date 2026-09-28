import type { PairingDeviceInfo, PairingEndReason } from "@gryt/core";

/* What the link screens say, kept out of the components so the tests can read it. Worded
   as in docs/pairing-design.md section 7, which both apps follow. */

/** "Gryt desktop on macOS", or whichever half N sent. N chooses these, so they're a claim. */
export function deviceLine(device: PairingDeviceInfo): string {
  const app = device.app.trim();
  const platform = device.platform.trim();
  if (app && platform) return `${app} on ${platform}`;
  return app || platform || "No details given";
}

/** Where the relay puts both ends, from their IP addresses. */
export function locationLine(location: string | null, yourLocation: string | null): string {
  const there = location ? `Near ${location}.` : "Location unknown.";
  if (!yourLocation) return there;
  return `${there} You're near ${yourLocation}.`;
}

/** Why a link stopped, for the approving side. Null when there's nothing to say. */
export function approverEndText(reason: PairingEndReason): string | null {
  switch (reason) {
    case "cancelled":
      return null;
    case "cancelled_by_other":
      return "Cancelled on the other device.";
    case "mismatch":
      return "Nothing was sent. If the emoji really were different, somebody may have got in between the two devices. Start again from the new device.";
    case "timed_out":
      return "The 60 seconds ran out, so nothing was sent. Start again from the new device.";
    case "expired":
      return "That code has run out. The new device shows a fresh one after a moment.";
    case "already_claimed":
      return "Somebody else already scanned this code. If that wasn't you, cancel on the new device.";
    case "unknown_code":
      return "No device is waiting with that code. Check it against the new device and try again.";
    case "wrong_relay":
      return "This code belongs to a different sign-in service from the one this app uses, so it wasn't opened.";
    case "newer_version":
      return "This code comes from a newer version of Gryt. Update this app and try again.";
    case "not_pairing":
      return "That isn't a code for linking a device.";
    case "rate_limited":
      return "Too many tries from this network. Wait a while and try again.";
    case "tampered":
    case "wrong_account":
      return "Something in the exchange didn't check out, so it stopped. Start again from the new device.";
    case "sign_in_failed":
      return "The new device couldn't finish signing in. Start again from the new device.";
    case "relay_error":
      return "Couldn't reach Gryt's linking service. Check your connection and try again.";
    default:
      return approveErrorText(reason.slice("approve:".length));
  }
}

/** The Keycloak extension's refusals (auth#46), as they reach the approving side. */
function approveErrorText(code: string): string {
  switch (code) {
    case "required_actions":
      return "Your account has something to finish first, like verifying your email. Do that in your account settings, then try again.";
    case "rate_limited":
      return "You've linked a lot of devices lately. Wait an hour and try again.";
    case "user_locked":
    case "user_disabled":
      return "Your account is locked right now, so it can't sign in another device.";
    case "no_token":
      return "You're signed out on this phone. Sign in again, then try again.";
    case "network":
      return "Couldn't reach the sign-in service. Check your connection and try again.";
    default:
      return `The sign-in service turned this down (${code}). Start again from the new device.`;
  }
}

/** Seconds left on the Approve button, never below zero. */
export function secondsLeft(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
