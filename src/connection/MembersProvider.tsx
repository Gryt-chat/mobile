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
 * Everyone on this server, and the two ways the app asks about them. The socket
 * always sent this and nothing read it, which is why a voice tile said
 * "Someone" (GRYT-503).
 *
 * **`byStreamId` is the only mapping from an SFU stream back to a person** —
 * `@gryt/voice` carries no identity, and the server already puts each member's
 * `streamID` in this list.
 */
export interface Members extends MemberIndex {
  /** Everyone the server admits to, in the order it sent them. */
  all: Member[];
  /** Their uploaded picture, or null for the generated face. */
  avatarUrlFor: (member: Member | undefined) => string | null;
  /**
   * What this device makes of each member's DM key, by server user id. Empty
   * until the first list is evaluated, a moment behind the list itself — **a
   * member missing here reads the same as having no key**: no encryption, and
   * nothing said about anybody.
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
   * `me` is here for the self-check on your own key: a member list showing
   * something else under your id is this server rewriting it. **Null before the
   * session settles turns the check off rather than failing it.**
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
   * Ask once rather than waiting. The list arrives on every join and voice state
   * change, but on a quiet server that is a long time after the socket settles.
   *
   * **Gated on `online`** — the handler refuses an unverified socket silently,
   * on purpose, because the desktop asks the moment it connects.
   */
  useEffect(() => {
    if (!socket || !online) return;
    socket.emit("members:fetch");
  }, [socket, online]);

  /**
   * Pin whoever is new, and notice whoever changed (GRYT-727).
   *
   * Separate from the list above so a slow evaluation never holds up drawing
   * the roster — a key decision changes what can be encrypted, not who is
   * online. The desktop splits it the same way and for the same reason.
   */
  useEffect(() => {
    if (!host || all.length === 0) return;

    // Dropped rather than applied if the server changed while it ran. Pins are
    // per scope, so applying one server's decisions under another's list would
    // put every member in the wrong state at once.
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
