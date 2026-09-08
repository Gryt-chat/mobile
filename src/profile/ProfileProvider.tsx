import { createContext, useContext, type ReactNode } from "react";

import { useProfile, type ProfileState } from "./useProfile";

const ProfileContext = createContext<ProfileState | null>(null);

/**
 * Your name and picture on this server, in one place. One instance, not one per consumer:
 * two copies agree until an optimistic rename lands in one. Inside `ConnectionsProvider`.
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
