import { useAccount } from "../account/useAccount";
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
 * Signed in, all of it is real: Keycloak's `preferred_username`, falling back
 * through `name` and `email` to the subject, which is what `profileFrom`
 * already decides and what the desktop shows too.
 *
 * Signed out there is genuinely nothing to know yet, and this says so rather
 * than inventing it. "You" stays as the name because it is a true thing to call
 * yourself and not a placeholder for a name that exists somewhere — a per-server
 * nickname arrives on `server:joined` and is not carried into `ConnectionState`
 * yet, so wiring it here would be reading a field nobody sets.
 *
 * `status` is derived rather than chosen, matching the desktop: all four of its
 * values come from what you are doing, which is why the sheet shows one and
 * never offers one.
 */
export function useMe(voiceChannelOpen: boolean): Me {
  const { state } = useAccount();

  const status: Status = voiceChannelOpen ? "in_voice" : "online";

  if (state.status === "signedIn") {
    return {
      name: state.profile.label,
      id: state.profile.sub,
      detail: state.profile.email ?? state.profile.label,
      signedIn: true,
      status,
    };
  }

  return {
    name: "You",
    id: null,
    /* Loading and signed out are different things, and the sheet should not
     * claim you are signed out while the Keychain is still being read. */
    detail: state.status === "loading" ? "Checking…" : "Not signed in",
    signedIn: false,
    status,
  };
}
