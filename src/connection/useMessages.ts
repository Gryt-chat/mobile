import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

import type { SessionIdentity } from "./claims";
import {
  discardDraft,
  draftMessage,
  hasPending,
  markFailed,
  markLatestFailed,
  markSending,
  receiveMessage,
  type LocalMessage,
} from "./outbox";
import type { ChatHistory, Message } from "./types";

/** What the server defaults to, stated here so the cursor maths matches it. */
const PAGE = 50;

/**
 * How long to wait for the server to echo a send back.
 *
 * There is no acknowledgement on `chat:send` — the confirmation is the
 * `chat:new` that follows, and a socket that has quietly died produces neither
 * that nor an error. Without a clock a message sent down a dead connection
 * stays grey for as long as the screen is open.
 */
const SEND_TIMEOUT_MS = 8000;

/**
 * Sends before the reader is told it did not work.
 *
 * Two, and the second one is free: the server remembers recent nonces and
 * replays the message it already stored rather than posting it twice, so a
 * resend of something that did arrive costs a round trip and nothing else.
 * That is what makes retrying safe enough to do without asking.
 */
const SEND_ATTEMPTS = 2;

export interface MessagesState {
  messages: LocalMessage[];
  loading: boolean;
  /** More history exists further back. */
  hasMore: boolean;
  loadingMore: boolean;
  error: string | null;
  /** Ask for the page before the oldest message held. */
  loadOlder: () => void;
  /** Draw a message and send it. Empty text does nothing. */
  send: (text: string) => void;
  /** Send a failed message again, under the nonce it already has. */
  retry: (nonce: string) => void;
  /** Give up on a failed message and take it off the screen. */
  discard: (nonce: string) => void;
}

export interface MessagesOptions {
  /** The token `chat:send` carries, refreshed if it is due. */
  getAccessToken: () => Promise<string | null>;
  /** Who we are here, so a message drawn early carries the right sender. */
  me: SessionIdentity | null;
}

/** A send that has gone out and not been answered. */
interface Attempt {
  timer: ReturnType<typeof setTimeout>;
  attempts: number;
  text: string;
  channelId: string;
}

/**
 * A channel's messages: the first page, the pages before it, whatever arrives
 * while you are looking, and whatever you say.
 *
 * Pagination is a cursor on time, not an offset — `before` is the ISO timestamp
 * of the oldest message held, and the server answers with the page immediately
 * older. An offset would skip or repeat messages whenever one is posted while
 * you are scrolling, which on a chat screen is most of the time.
 *
 * `hasMore` is `items.length >= limit` on the server, so it lies exactly once:
 * a channel whose history is a multiple of the page size reports more, and the
 * next request comes back empty. That is handled by treating an empty page as
 * the end rather than by trusting the flag.
 *
 * Sending draws the message first and reconciles after. The nonce is what makes
 * that possible: the server echoes it back to the sender alone, so the real
 * message can replace the drawn one in place. See `outbox.ts`, which holds the
 * part of this worth testing.
 */
export function useMessages(
  socket: Socket | null,
  channelId: string | null,
  options: MessagesOptions,
): MessagesState {
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read inside the callback rather than depended on, so asking for an older
  // page does not rebuild the listeners and lose the ones already attached.
  const oldest = useRef<string | null>(null);
  const pending = useRef(false);

  /* `me` and the token change whenever a token is refreshed, which is every
   * ten minutes. Held in refs so that does not tear down the listeners and
   * re-request the whole channel. */
  const meRef = useRef(options.me);
  meRef.current = options.me;
  const tokenRef = useRef(options.getAccessToken);
  tokenRef.current = options.getAccessToken;

  const attempts = useRef(new Map<string, Attempt>());

  /* Read by the callbacks below, which need the text of a message without
   * being rebuilt every time the list changes. */
  const messagesRef = useRef<LocalMessage[]>(messages);
  messagesRef.current = messages;

  const clearAttempt = useCallback((nonce: string) => {
    const attempt = attempts.current.get(nonce);
    if (!attempt) return;
    clearTimeout(attempt.timer);
    attempts.current.delete(nonce);
  }, []);

  useEffect(() => {
    if (!socket || !channelId) {
      setMessages([]);
      setHasMore(false);
      return;
    }

    let cancelled = false;
    oldest.current = null;
    pending.current = false;
    setMessages([]);
    setError(null);
    setLoading(true);

    const onHistory = (history: ChatHistory) => {
      // Every channel's history arrives on the same event, so a page for the
      // channel you just left would otherwise land in the one you are in.
      if (cancelled || history.conversation_id !== channelId) return;

      const items = history.items ?? [];
      // Oldest first from the server, which is the order they are rendered in.
      const older = history.before !== undefined;

      setMessages((current) => {
        if (older) return [...items, ...current];
        // A first page arriving does not throw away what has been said since —
        // a draft written while it was in flight would otherwise vanish.
        const drafts = current.filter((m) => m.pending || m.failed);
        return [...items, ...drafts];
      });
      // An empty page means the end regardless of what `hasMore` claims.
      setHasMore(items.length > 0 && history.hasMore);
      if (items.length > 0) oldest.current = items[0].created_at;

      setLoading(false);
      setLoadingMore(false);
      pending.current = false;
    };

    const onNew = (message: Message & { nonce?: string }) => {
      if (cancelled || message.conversation_id !== channelId) return;
      setMessages((current) => receiveMessage(current, message, meRef.current));
    };

    const onEdited = (message: Message) => {
      if (cancelled || message.conversation_id !== channelId) return;
      setMessages((current) =>
        current.map((m) => (m.message_id === message.message_id ? message : m)),
      );
    };

    const onDeleted = ({
      conversation_id,
      message_id,
    }: {
      conversation_id: string;
      message_id: string;
    }) => {
      if (cancelled || conversation_id !== channelId) return;
      setMessages((current) => current.filter((m) => m.message_id !== message_id));
    };

    const onError = (payload: string | { message?: string; error?: string }) => {
      if (cancelled) return;
      const text =
        typeof payload === "string"
          ? payload
          : payload?.message || payload?.error || "The server refused the request.";

      /* `chat:error` covers both directions and says which it is about only by
       * what is outstanding. A refused send is reported on the message itself
       * — a whole channel replaced by an error because one message was too fast
       * would be worse than what went wrong. With nothing being sent it is
       * about the fetch, and it goes where a fetch failure goes. */
      if (hasPending(messagesRef.current)) {
        setMessages((current) => markLatestFailed(current, text));
        return;
      }

      setError(text);
      setLoading(false);
      setLoadingMore(false);
      pending.current = false;
    };

    /**
     * `server:error` is where an unusable token lands, and it is a different
     * event from `chat:error`.
     *
     * Without this a send made with an expired token gets no answer at all and
     * sits grey until the timeout. Restoring the session is a bigger question
     * than this hook — GRYT-415 — so it says what happened and stops there.
     */
    const onServerError = (payload: { error?: string; message?: string }) => {
      if (cancelled || !hasPending(messagesRef.current)) return;
      setMessages((current) =>
        markLatestFailed(
          current,
          payload?.error === "token_invalid"
            ? "Your session has expired. Open the server again."
            : payload?.message || "The server refused the request.",
        ),
      );
    };

    /**
     * A reconnect has to ask again.
     *
     * Nothing was delivered while the socket was down, so the first page is
     * refetched rather than trusted — anything said in the gap is only in the
     * server's copy. `dropped` is what keeps this from firing on the very
     * first connection, which the effect above has already fetched for.
     *
     * The list is not cleared and `loading` is not set: the reader keeps the
     * messages they had until the new page replaces them. A channel that
     * blanks every time a phone changes cell is worse than one that is briefly
     * a few seconds stale.
     */
    let dropped = false;

    const onDisconnect = () => {
      if (cancelled) return;
      dropped = true;
      /* A page that was in flight will never arrive. Leaving the latch set
       * would jam `loadOlder` for the life of the screen. */
      pending.current = false;
      setLoadingMore(false);
    };

    const onConnect = () => {
      if (cancelled || !dropped) return;
      dropped = false;
      // Queued by the guard until this connection has proved itself.
      socket.emit("chat:fetch", { conversationId: channelId, limit: PAGE });
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("chat:history", onHistory);
    socket.on("chat:new", onNew);
    socket.on("chat:edited", onEdited);
    // A reaction re-broadcasts the whole message, so it is an edit here.
    socket.on("chat:reaction", onEdited);
    socket.on("chat:deleted", onDeleted);
    socket.on("chat:error", onError);
    socket.on("server:error", onServerError);

    socket.emit("chat:fetch", { conversationId: channelId, limit: PAGE });

    return () => {
      cancelled = true;
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("chat:history", onHistory);
      socket.off("chat:new", onNew);
      socket.off("chat:edited", onEdited);
      socket.off("chat:reaction", onEdited);
      socket.off("chat:deleted", onDeleted);
      socket.off("chat:error", onError);
      socket.off("server:error", onServerError);
    };
  }, [socket, channelId]);

  /**
   * A draft that has stopped being pending has been answered, one way or the
   * other, so the clock on it can stop.
   *
   * Driven off the list rather than off each handler because there are four
   * ways for a send to settle — the echo, the echo of a resend, an error, a
   * discard — and a timer left running behind any one of them would resend a
   * message that had already arrived.
   */
  useEffect(() => {
    for (const nonce of [...attempts.current.keys()]) {
      if (!messages.some((m) => m.nonce === nonce && m.pending)) clearAttempt(nonce);
    }
  }, [messages, clearAttempt]);

  /** Stop every clock when the screen goes away. */
  useEffect(
    () => () => {
      for (const attempt of attempts.current.values()) clearTimeout(attempt.timer);
      attempts.current.clear();
    },
    [],
  );

  const dispatch = useCallback(
    async (nonce: string, text: string, channel: string, attempt: number) => {
      if (!socket) return;

      const accessToken = await tokenRef.current();

      /* A resend of a message that arrived while the token was being fetched.
       * The list is what settles a send, and the clean-up below takes the
       * attempt off the map the moment it stops being pending — so a missing
       * entry means there is nothing left to send. Only checked from the
       * second attempt on: the first one is dispatched in the same tick as the
       * draft, before the list has been re-read. */
      if (attempt > 1 && !attempts.current.has(nonce)) return;

      if (!accessToken) {
        setMessages((current) => markFailed(current, nonce, "Not signed in to this server."));
        return;
      }

      socket.emit("chat:send", { conversationId: channel, accessToken, text, nonce });

      const timer = setTimeout(() => {
        if (attempt < SEND_ATTEMPTS) {
          void dispatch(nonce, text, channel, attempt + 1);
          return;
        }
        attempts.current.delete(nonce);
        setMessages((current) => markFailed(current, nonce, "Not delivered."));
      }, SEND_TIMEOUT_MS);

      clearAttempt(nonce);
      attempts.current.set(nonce, { timer, attempts: attempt, text, channelId: channel });
    },
    [socket, clearAttempt],
  );

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || !socket || !channelId) return;

      const nonce = Crypto.randomUUID();
      setMessages((current) => [
        ...current,
        draftMessage({ channelId, text, nonce, me: meRef.current }),
      ]);
      void dispatch(nonce, text, channelId, 1);
    },
    [socket, channelId, dispatch],
  );

  const retry = useCallback(
    (nonce: string) => {
      if (!socket || !channelId) return;
      const text = messagesRef.current.find((m) => m.nonce === nonce)?.text;
      if (!text) return;
      setMessages((current) => markSending(current, nonce));
      void dispatch(nonce, text, channelId, 1);
    },
    [socket, channelId, dispatch],
  );

  const discard = useCallback(
    (nonce: string) => {
      clearAttempt(nonce);
      setMessages((current) => discardDraft(current, nonce));
    },
    [clearAttempt],
  );

  const loadOlder = useCallback(() => {
    // One page in flight at a time. A list near its top fires this on every
    // frame otherwise, and the server rate-limits `chat:fetch`.
    if (!socket || !channelId || pending.current || !hasMore || !oldest.current) return;
    pending.current = true;
    setLoadingMore(true);
    socket.emit("chat:fetch", {
      conversationId: channelId,
      limit: PAGE,
      before: oldest.current,
    });
  }, [socket, channelId, hasMore]);

  return {
    messages,
    loading,
    hasMore,
    loadingMore,
    error,
    loadOlder,
    send,
    retry,
    discard,
  };
}
