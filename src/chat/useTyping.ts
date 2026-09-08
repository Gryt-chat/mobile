import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { Socket } from "socket.io-client";

import {
  activeTypers,
  dropTyper,
  noteTyping,
  shouldEmitTyping,
  TYPING_TIMEOUT_MS,
  type Typer,
} from "./typing";

/**
 * The live half of the typing indicator: a subscription, and a throttle. `chat:typing`
 * arrives for every channel. **A backgrounded phone stops claiming to type.**
 */
export function useTyping(socket: Socket | null, conversationId: string | null, me: string | null) {
  const [typers, setTypers] = useState<Typer[]>([]);

  /* When we last said we were typing, or null for not currently claiming to. A ref,
   * because writing it must not re-render the composer on every keystroke. */
  const lastEmit = useRef<number | null>(null);
  const channel = useRef(conversationId);
  channel.current = conversationId;

  const stop = useCallback(() => {
    if (!socket || lastEmit.current === null || !channel.current) return;
    lastEmit.current = null;
    socket.emit("chat:stop_typing", { conversationId: channel.current });
  }, [socket]);

  const type = useCallback(() => {
    if (!socket || !channel.current) return;
    const now = Date.now();
    if (!shouldEmitTyping(lastEmit.current, now)) return;
    lastEmit.current = now;
    socket.emit("chat:typing", { conversationId: channel.current });
  }, [socket]);

  useEffect(() => {
    if (!socket || !conversationId) return;

    const onTyping = (payload: {
      serverUserId?: string;
      nickname?: string;
      avatarFileId?: string | null;
      conversationId?: string;
    }) => {
      if (payload?.conversationId !== conversationId) return;
      if (!payload.serverUserId) return;
      /* Your own typing comes back on a second device signed in as you. Drawing
       * it would be the app telling you about yourself. */
      if (payload.serverUserId === me) return;

      setTypers((current) =>
        noteTyping(
          current,
          {
            serverUserId: payload.serverUserId!,
            nickname: payload.nickname || "Someone",
            avatarFileId: payload.avatarFileId ?? null,
          },
          Date.now(),
        ),
      );
    };

    const onStop = (payload: { serverUserId?: string; conversationId?: string }) => {
      if (payload?.conversationId !== conversationId || !payload.serverUserId) return;
      setTypers((current) => dropTyper(current, payload.serverUserId!));
    };

    socket.on("chat:typing", onTyping);
    socket.on("chat:stop_typing", onStop);
    return () => {
      socket.off("chat:typing", onTyping);
      socket.off("chat:stop_typing", onStop);
    };
  }, [socket, conversationId, me]);

  /* Changing channel forgets everybody. Their claim was about the channel you
   * left, and the server does not resend for the one you arrived in. */
  useEffect(() => {
    setTypers([]);
    lastEmit.current = null;
  }, [conversationId]);

  /**
   * One interval, only while somebody is typing, to expire the claims. The state is
   * timestamps, so something has to ask. A second is finer than the eye needs.
   */
  useEffect(() => {
    if (typers.length === 0) return;
    const tick = setInterval(() => {
      setTypers((current) => {
        const still = activeTypers(current, Date.now());
        return still.length === current.length ? current : still;
      });
    }, 1_000);
    return () => clearInterval(tick);
  }, [typers.length]);

  /* Backgrounding is leaving, as far as everybody else is concerned. */
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") stop();
    });
    return () => subscription.remove();
  }, [stop]);

  /* And so is closing the channel or unmounting, or typing a letter and hitting back
   * leaves you typing for eight seconds in a channel you are not in. */
  useEffect(() => stop, [stop, conversationId]);

  return {
    /** Everybody currently claiming to type here, freshest last. */
    typers: activeTypers(typers, Date.now()),
    /** Call on every change to the composer. Throttled inside. */
    type,
    /** Call on send, on blur, and on anything that ends the message. */
    stop,
  };
}

export { TYPING_TIMEOUT_MS };
