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
 * Who you are, from the only source that knows — the `ME` constant this replaces seeded
 * every face on the string "You". The name set on this device wins (GRYT-498). Signed in
 * with nothing set it is `displayName`, **not `label`**, which falls to the email.
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
