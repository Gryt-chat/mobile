import { useCallback, useEffect, useState } from "react";

import { getServerHttpBase } from "../servers/address";
import { useServerConnection } from "../connection/ConnectionProvider";

/** What the server sends back after either kind of change. */
interface ProfileUpdated {
  nickname: string;
  avatarFileId: string | null;
}

/** The server truncates at 20 without saying so. The field stops there instead. */
export const NICKNAME_MAX = 20;

export interface ProfileState {
  /** What you are called on this server. */
  nickname: string;
  /** The uploaded picture, or null for the generated face. */
  avatarUrl: string | null;
  /** True while either change is in flight. */
  saving: boolean;
  /** Why the last change failed. Cleared when the next one starts. */
  problem: string | null;
  /** False where there is no session to change anything with. */
  editable: boolean;
  rename: (nickname: string) => void;
  setAvatar: (uri: string, mime: string, name: string) => Promise<void>;
}

/**
 * Your name and picture **on the server you are looking at**.
 *
 * Both are per-server, which is the fact that shapes the whole You page: the
 * nickname lives on the `users` row for this server and the avatar is a file in
 * this server's bucket. There is no global Gryt profile to edit — an account
 * carries who you are, not what you are called in someone's room.
 *
 * Seeded from `me.nickname`, which comes off the access token's claims, and
 * then held here: the token is not reissued when the name changes, so reading
 * it again after a rename would show the old one until the next refresh.
 *
 * Two different transports for two changes, which is the server's shape rather
 * than a choice:
 *
 * - The nickname goes over the socket, `profile:update` → `profile:updated`.
 * - The avatar is an authenticated multipart POST, and the socket is told
 *   afterwards with `avatar:updated` so the member list redraws for everyone
 *   else. The POST alone changes the row and tells nobody.
 */
export function useProfile(host: string | null): ProfileState {
  const { socket, me, getAccessToken, online } = useServerConnection();

  const [nickname, setNickname] = useState("");
  const [avatarFileId, setAvatarFileId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /* Seeded from the claims and then owned here. Keyed on the id rather than on
   * `me` so switching server re-seeds, and a reconnect to the same one does
   * not stamp a rename back to what the old token said. */
  useEffect(() => {
    if (me) setNickname(me.nickname);
  }, [me?.serverUserId]);

  useEffect(() => {
    if (!socket) return;

    const updated = (next: ProfileUpdated) => {
      setNickname(next.nickname);
      setAvatarFileId(next.avatarFileId);
      setSaving(false);
      setProblem(null);
    };
    /* The server sends a bare string here, not an object. */
    const failed = (message: string) => {
      setSaving(false);
      setProblem(typeof message === "string" ? message : "That did not save.");
    };

    socket.on("profile:updated", updated);
    socket.on("profile:error", failed);
    return () => {
      socket.off("profile:updated", updated);
      socket.off("profile:error", failed);
    };
  }, [socket]);

  const rename = useCallback(
    (next: string) => {
      const trimmed = next.trim().slice(0, NICKNAME_MAX);
      if (!socket || !trimmed || trimmed === nickname) return;
      setSaving(true);
      setProblem(null);
      /* Optimistic. The name is on screen in three places and a round trip of
       * lag on your own name reads as the tap not registering. `profile:updated`
       * confirms it, and `profile:error` is what puts it back. */
      setNickname(trimmed);
      socket.emit("profile:update", { nickname: trimmed });
    },
    [socket, nickname],
  );

  const setAvatar = useCallback(
    async (uri: string, mime: string, name: string) => {
      if (!host || !socket) return;
      setSaving(true);
      setProblem(null);

      try {
        const token = await getAccessToken();
        if (!token) throw new Error("No session on this server.");

        /* React Native's FormData takes `{ uri, type, name }` where the web
         * takes a Blob — the native side reads the file off disk itself, so
         * fetching the uri into a blob first would copy the whole image
         * through JavaScript for nothing. */
        const body = new FormData();
        body.append("file", { uri, type: mime, name } as unknown as Blob);

        const res = await fetch(`${getServerHttpBase(host)}/api/uploads/avatar`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body,
        });

        if (!res.ok) {
          const detail = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(detail?.message ?? `The server refused it (${res.status}).`);
        }

        /* The POST changes the row and tells nobody. This is what redraws the
         * member list for everyone else, and what sends `profile:updated`
         * back here with the new file id. */
        socket.emit("avatar:updated");
      } catch (error) {
        setSaving(false);
        setProblem(error instanceof Error ? error.message : "That did not upload.");
      }
    },
    [host, socket, getAccessToken],
  );

  return {
    nickname,
    avatarUrl:
      host && avatarFileId
        ? `${getServerHttpBase(host)}/api/uploads/files/${avatarFileId}`
        : null,
    saving,
    problem,
    /* Both changes need a joined session: the nickname needs the socket past
     * the handshake, and the upload needs a bearer token that only exists
     * after one. */
    editable: Boolean(socket && me && online),
    rename,
    setAvatar,
  };
}
