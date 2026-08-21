import { createContext, useContext, type ReactNode } from "react";

import { useProfile, type ProfileState } from "./useProfile";

const ProfileContext = createContext<ProfileState | null>(null);

/**
 * Your name and picture on this server, in one place.
 *
 * **One instance, not one per consumer.** Two things draw you — the You page
 * and the avatar in the navbar — and `useProfile` subscribes to
 * `profile:updated` on the socket, so calling it twice would be two
 * subscriptions holding two copies of the same answer. They would agree almost
 * always, which is the worst kind of duplicate: it looks fine until an
 * optimistic rename lands in one and not the other.
 *
 * It lives **inside** `ConnectionProvider` rather than in `ShellProvider`,
 * where the other shell-wide state is, and it has to: `useProfile` reads the
 * socket and the session, and neither exists above the connection.
 */
export function ProfileProvider({
  host,
  children,
}: {
  host: string | null;
  children?: ReactNode;
}) {
  const profile = useProfile(host);

  return <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>;
}

export function useProfileState(): ProfileState {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("useProfileState must be used inside ProfileProvider.");
  return value;
}
