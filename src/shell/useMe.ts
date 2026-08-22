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
 * Who you are, from the only source that actually knows.
 *
 * This replaces a `ME` constant of `{ name: "You", userId: "not signed in" }`,
 * which was the last of the mockups and was wrong in a way worth naming: every
 * person on every phone was seeded on the string "You", so the generated face
 * that is supposed to identify somebody was **the same face for everybody**.
 *
 * The name you set on this device wins over everything below it. It is the
 * default a join carries — `joinServer(socket, host, { nickname })` takes it
 * from here, which is why every guest used to arrive called "You" — and it is
 * what the You page shows before any server has a name for you. GRYT-498.
 *
 * Signed in and with nothing set, the name is `displayName` — the username or the real name the
 * account chose. **Not `label`**, which falls through to the email: that is the
 * right answer for the Account row, which is about which account this is, and
 * the wrong one here. Losing a session dropped the per-server nickname, this
 * fell back to `label`, and somebody's own email address appeared where their
 * name had been. GRYT-500.
 *
 * An account with no chosen name is back to "You", which is the same answer as
 * being signed out and is the honest one — there is a name to draw only when
 * somebody has set one.
 *
 * Signed out there is genuinely nothing to know yet, and this says so rather
 * than inventing it. "You" is a true thing to call yourself and not a
 * placeholder for a name that exists somewhere.
 *
 * `status` is derived rather than chosen, matching the desktop: all four of its
 * values come from what you are doing, which is why the sheet shows one and
 * never offers one.
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
