import { attachmentUrl } from "../chat/files";
import { useCallback, useEffect, useState } from "react";

import { getServerHttpBase } from "../servers/address";
import { useServers } from "../servers/store";
import { useServerConnection } from "../connection/ConnectionsProvider";
import { useDeviceProfile } from "./deviceProfile";

/** What the server sends back after either kind of change. */
interface ProfileUpdated {
  nickname: string;
  avatarFileId: string | null;
}

/** The server truncates at 20 without saying so. The field stops there instead. */
export const NICKNAME_MAX = 20;

/** Whose profile the pencils are editing. */
export type ProfileScope = "server" | "device";

export interface ProfileState {
  /** What you are called on this server, or on this device with no server. */
  nickname: string;
  /** The uploaded picture, or null for the generated face. */
  avatarUrl: string | null;
  /** True while either change is in flight. */
  saving: boolean;
  /** Why the last change failed. Cleared when the next one starts. */
  problem: string | null;
  /**
   * Which profile is on screen. "device" **only when you are in no server at all** —
   * swapping on a dropped wifi makes a rename look applied when it is not.
   */
  scope: ProfileScope;
  /** False where there is no session to change anything with. */
  editable: boolean;
  rename: (nickname: string) => void;
  setAvatar: (uri: string, mime: string, name: string) => Promise<void>;
}

/**
 * Your name and picture **on the server you are looking at**, or on this device when
 * you are in none. **A bare avatar POST changes the row and tells nobody.**
 */
export function useProfile(host: string | null): ProfileState {
  const { socket, me, getAccessToken, online } = useServerConnection();
  const { servers, recordNickname } = useServers();
  const device = useDeviceProfile();

  /* What this server called you last time. Not authoritative, but it is the
   * difference between a launch showing your name and one showing a fallback. */
  const lastKnown = servers.find((s) => s.host === host)?.nickname ?? "";

  const [nickname, setNickname] = useState(lastKnown);
  const [avatarFileId, setAvatarFileId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /* Each server's own remembered name, before any session exists. Ordered before the
   * seed from the claims, so a live session still wins on the shared render. */
  useEffect(() => {
    setNickname(servers.find((s) => s.host === host)?.nickname ?? "");
    setAvatarFileId(null);
  }, [host]);

  /**
   * Keep what the server has told us it calls you: the claims and
   * `profile:updated`, never `rename`, which is optimistic.
   */
  const remember = useCallback(
    (confirmed: string) => {
      if (host && confirmed) void recordNickname(host, confirmed);
    },
    [host, recordNickname],
  );

  /* Seeded from the claims and then owned here. Keyed on the id, so switching server
   * re-seeds and a reconnect does not stamp a rename back. */
  useEffect(() => {
    if (!me) return;
    setNickname(me.nickname);
    remember(me.nickname);
  }, [me?.serverUserId]);

  useEffect(() => {
    if (!socket) return;

    const updated = (next: ProfileUpdated) => {
      setNickname(next.nickname);
      setAvatarFileId(next.avatarFileId);
      setSaving(false);
      setProblem(null);
      remember(next.nickname);
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
  }, [socket, remember]);

  const rename = useCallback(
    (next: string) => {
      const trimmed = next.trim().slice(0, NICKNAME_MAX);
      if (!socket || !trimmed || trimmed === nickname) return;
      setSaving(true);
      setProblem(null);
      /* Optimistic: the name is on screen in three places, and a round trip of lag
       * reads as the tap not registering. `profile:error` puts it back. */
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

        /* **A real `Blob`**, not `{ uri, type, name }` — 0.86 rejects that. Fetching
         * the `file://` uri gives a native handle, so nothing is copied. */
        const raw = await fetch(uri).then((r) => r.blob());

        /* Typed via `slice`, because React Native's Blob has no settable `type` and
         * an untyped part is sent as `application/octet-stream`, which the server
         * refuses with "Only image files are allowed". */
        const file = (raw.type || "").startsWith("image/")
          ? raw
          : raw.slice(0, raw.size, mime);

        const body = new FormData();
        body.append("file", file, name);

        const res = await fetch(`${getServerHttpBase(host)}/api/uploads/avatar`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body,
        });

        if (!res.ok) {
          const detail = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(detail?.message ?? `The server refused it (${res.status}).`);
        }

        /* The POST changes the row and tells nobody. This is what redraws the member
         * list and sends `profile:updated` back with the new file id. */
        socket.emit("avatar:updated");
      } catch (error) {
        setSaving(false);
        setProblem(error instanceof Error ? error.message : "That did not upload.");
      }
    },
    [host, socket, getAccessToken],
  );

  /**
   * In no server, both of these edit the device profile instead. Nothing uploads the
   * picture — a join carries the nickname and there is no join-time avatar.
   */
  const deviceProfile = {
    nickname: device.nickname ?? "",
    avatarUrl: device.avatarUri,
    saving: false,
    problem: null,
    scope: "device" as const,
    editable: device.ready,
    rename: (next: string) => {
      void device.setNickname(next.trim().slice(0, NICKNAME_MAX));
    },
    setAvatar: (uri: string) => device.setAvatar(uri),
  };

  /* Both changes need a joined session: the nickname needs the socket past the
   * handshake, and the upload a bearer token that only exists after one. */
  const editable = Boolean(socket && me && online);

  if (!host) return deviceProfile;

  return {
    nickname,
    avatarUrl: host && avatarFileId ? attachmentUrl(host, avatarFileId) : null,
    saving,
    problem,
    scope: "server",
    editable,
    rename,
    setAvatar,
  };
}
