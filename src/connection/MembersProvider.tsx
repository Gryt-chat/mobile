import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { MemberKeyState } from "@gryt/crypto";

import { useServerConnection } from "./ConnectionsProvider";
import { evaluateMobileMemberKeys } from "./memberKeys";
import { indexMembers, memberAvatarUrl, type MemberIndex } from "./members";
import type { Member } from "./types";

/**
 * Everyone on this server, and the two ways the app asks about them. **`byStreamId`
 * is the only mapping from an SFU stream back to a person** (GRYT-503).
 */
export interface Members extends MemberIndex {
  /** Everyone the server admits to, in the order it sent them. */
  all: Member[];
  /** Their uploaded picture, or null for the generated face. */
  avatarUrlFor: (member: Member | undefined) => string | null;
  /**
   * What this device makes of each member's DM key, by server user id. **A member
   * missing here reads the same as having no key**: no encryption, nothing said.
   */
  keyStates: Record<string, MemberKeyState>;
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
  /**
   * `me` is here for the self-check on your own key. **Null before the session
   * settles turns the check off rather than failing it.**
   */
  const { socket, online, me } = useServerConnection();
  const [all, setAll] = useState<Member[]>([]);
  const [keyStates, setKeyStates] = useState<Record<string, MemberKeyState>>({});

  /* Dropped on a change of server rather than left to be replaced, so the voice
   * sheet cannot label a tile with somebody from the server you just left. */
  useEffect(() => {
    setAll([]);
    setKeyStates({});
  }, [host]);

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
   * Ask once rather than waiting: on a quiet server the list is a long time after the
   * socket settles. **Gated on `online`** — the handler refuses silently.
   */
  useEffect(() => {
    if (!socket || !online) return;
    socket.emit("members:fetch");
  }, [socket, online]);

  /**
   * Pin whoever is new, and notice whoever changed. Separate from the list, so a slow
   * evaluation never holds up drawing the roster (GRYT-727).
   */
  useEffect(() => {
    if (!host || all.length === 0) return;

    // Dropped rather than applied if the server changed while it ran: pins are per
    // scope, and one server's decisions under another's list is every member wrong.
    let live = true;
    void evaluateMobileMemberKeys({
      host,
      members: all,
      myServerUserId: me?.serverUserId ?? null,
    })
      .then((states) => {
        if (live) setKeyStates(states);
      })
      .catch(() => {
        // No seed, or storage that will not answer. Nothing is encrypted, which
        // is where everybody started, and there is nothing to retry against.
      });

    return () => {
      live = false;
    };
  }, [host, all, me?.serverUserId]);

  const value = useMemo<Members>(
    () => ({
      all,
      ...indexMembers(all),
      avatarUrlFor: (member) => memberAvatarUrl(host, member),
      keyStates,
    }),
    [all, host, keyStates],
  );

  return <MembersContext.Provider value={value}>{children}</MembersContext.Provider>;
}
