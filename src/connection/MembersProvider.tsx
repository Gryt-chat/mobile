import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useServerConnection } from "./ConnectionProvider";
import { indexMembers, memberAvatarUrl, type MemberIndex } from "./members";
import type { Member } from "./types";

/**
 * Everyone on this server, and the two ways the app asks about them.
 *
 * The socket has always sent this and nothing read it, which is why other
 * people are drawn as a generated face everywhere and why a voice tile says
 * "Someone" rather than a name. GRYT-503.
 *
 * `byStreamId` is the interesting one. It is the only mapping there is from an
 * SFU stream back to a person: `@gryt/voice` keys `streams` by stream id and
 * carries `isLocal` and nothing else — no user id, no nickname — so a tile
 * could say somebody was there and not who. GRYT-452 recorded that as a
 * boundary needing the engine or the SFU to change. It does not: the server
 * already puts each member's `streamID` in this list.
 */
export interface Members extends MemberIndex {
  /** Everyone the server admits to, in the order it sent them. */
  all: Member[];
  /** Their uploaded picture, or null for the generated face. */
  avatarUrlFor: (member: Member | undefined) => string | null;
}

const MembersContext = createContext<Members | null>(null);

export function useMembers(): Members {
  const value = useContext(MembersContext);
  if (!value) throw new Error("useMembers must be used inside MembersProvider.");
  return value;
}

export function MembersProvider({
  host,
  children,
}: {
  host: string | null;
  children?: ReactNode;
}) {
  const { socket, online } = useServerConnection();
  const [all, setAll] = useState<Member[]>([]);

  /* Dropped on a change of server rather than left to be replaced, so the voice
   * sheet cannot label a tile with somebody from the server you just left. */
  useEffect(() => setAll([]), [host]);

  useEffect(() => {
    if (!socket) return;

    const received = (members: Member[]) => {
      if (Array.isArray(members)) setAll(members);
    };

    socket.on("members:list", received);
    return () => {
      socket.off("members:list", received);
    };
  }, [socket]);

  /**
   * Ask once, rather than waiting for something to change.
   *
   * The server broadcasts this list on every join and every voice state change,
   * so it does arrive on its own — eventually. On a quiet server that can be a
   * long time after the socket settles, and a member list that fills in when
   * somebody else happens to speak is worse than one that is simply there.
   *
   * Gated on `online`, which is the handshake having settled: the handler
   * refuses an unverified socket silently, on purpose, because the desktop asks
   * optimistically the moment it connects.
   */
  useEffect(() => {
    if (!socket || !online) return;
    socket.emit("members:fetch");
  }, [socket, online]);

  const value = useMemo<Members>(
    () => ({
      all,
      ...indexMembers(all),
      avatarUrlFor: (member) => memberAvatarUrl(host, member),
    }),
    [all, host],
  );

  return <MembersContext.Provider value={value}>{children}</MembersContext.Provider>;
}
