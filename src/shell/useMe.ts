import { useAccount } from "../account/useAccount";
import { useDeviceProfile } from "../profile/deviceProfile";
import type { Status } from "./data";

export interface Me {
  /** What to call you, and what your generated face is seeded on. */
  name: string;
  /** Who you are, when that is knowable. Null when signed out. */
  id: string | null;
  /** What the "you" sheet shows under your name. */
  detail: string;
  signedIn: boolean;
  status: Status;
}

/**
 * Who you are, from the only source that actually knows. The `ME` constant this
 * replaces seeded every person on every phone on the string "You", so the
 * generated face meant to identify somebody was the same face for everybody.
 *
 * The name set on this device wins over everything below it — it is the default
 * a join carries, which is why every guest used to arrive called "You"
 * (GRYT-498).
 *
 * Signed in with nothing set, the name is `displayName`. **Not `label`**, which
 * falls through to the email: losing a session dropped the per-server nickname
 * and put somebody's own email address where their name had been (GRYT-500).
 *
 * `status` is derived rather than chosen, matching the desktop, which is why
 * the sheet shows one and never offers one.
 */
export function useMe(voiceChannelOpen: boolean): Me {
  const { state } = useAccount();
  const device = useDeviceProfile();

  const status: Status = voiceChannelOpen ? "in_voice" : "online";

  if (state.status === "signedIn") {
    return {
      name: device.nickname ?? state.profile.displayName ?? "You",
      id: state.profile.sub,
      detail: state.profile.email ?? state.profile.label,
      signedIn: true,
      status,
    };
  }

  return {
    name: device.nickname ?? "You",
    id: null,
    /* Loading and signed out are different things, and the sheet should not
     * claim you are signed out while the Keychain is still being read. */
    detail: state.status === "loading" ? "Checking…" : "Not signed in",
    signedIn: false,
    status,
  };
}
