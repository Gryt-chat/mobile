import type { OpenedMessage, SealedAttachmentKey } from "@gryt/crypto";

import { attachmentUrl } from "../chat/files";
import {
  materialiseSealedAttachment,
  sealedAttachmentMeta,
} from "../chat/sealedAttachments";
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
 * How long to wait for the server to echo a send back. **There is no
 * acknowledgement on `chat:send`** — the confirmation is the `chat:new` that
 * follows, and a dead socket produces neither that nor an error.
 */
const SEND_TIMEOUT_MS = 8000;

/**
 * Sends before the reader is told it did not work. **The second is free**: the
 * server remembers recent nonces and replays what it stored rather than posting
 * twice, which is what makes retrying safe to do without asking.
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
  /**
   * Draw a message and send it. Empty text does nothing.
   *
   * `replyTo` is a message id the server hangs the new message off. It has
   * always accepted one; nothing sent it until now.
   */
  send: (
    text: string,
    replyTo?: string | null,
    /**
     * Files already uploaded, plus where they came from. `ids` goes to the
     * server; `localUris` is what the draft draws while the send is in flight.
     * `keys` is `sealAttachment`'s output, absent when files went up in the
     * clear (GRYT-761).
     */
    files?: {
      ids: string[];
      localUris: string[];
      keys?: Record<string, SealedAttachmentKey> | null;
    } | null,
  ) => void;
  /** Send a failed message again, under the nonce it already has. */
  retry: (nonce: string) => void;
  /** Give up on a failed message and take it off the screen. */
  discard: (nonce: string) => void;
  /**
   * Add or take back a reaction — the server toggles. **No optimistic draw**:
   * `chat:reaction` comes back with the whole message, and guessing the count
   * locally is a second source of truth for a number the server computes.
   */
  react: (messageId: string, src: string) => void;
  /** Change what a message says. Yours only; the server checks again. */
  edit: (messageId: string, text: string) => void;
  /** Remove a message. Yours, or anybody's if the server lets you. */
  remove: (messageId: string) => void;
  /**
   * Report somebody else's message to whoever runs the server.
   *
   * Fire and forget from here; the answer arrives as `report:submitted` or
   * `report:already_reported` and goes to `onReported`. The server refuses
   * your own and rate-limits to ten a minute.
   */
  report: (messageId: string) => void;
}

export interface MessagesOptions {
  /** The token `chat:send` carries, refreshed if it is due. */
  getAccessToken: () => Promise<string | null>;
  /**
   * What happened to a report, so the screen can say so.
   *
   * A callback rather than a toast raised in here, for the same reason `seal`
   * and `open` are passed in: this hook holds the socket and the message list
   * and nothing that draws. The three outcomes are all the server offers.
   */
  onReported?: (outcome: "submitted" | "already" | "refused", message?: string) => void;
  /** Who we are here, so a message drawn early carries the right sender. */
  me: SessionIdentity | null;
  /**
   * Turn a message into an envelope, or null to send it in the clear
   * (GRYT-729). Passed in, because whether a conversation can be sealed depends
   * on every member's key and the composer has to say so before send. Absent
   * for a channel.
   */
  seal?: (
    plaintext: string,
    attachments?: Record<string, SealedAttachmentKey>,
  ) => Promise<string | null>;
  /**
   * Open an envelope, or null when there is no wrapped key for us. Throws when
   * a key is there and does not open — see `sealedState`. `attachments` is the
   * file keys the message carried.
   */
  open?: (sealed: string) => Promise<OpenedMessage | null>;
  /**
   * Turn a downloaded attachment back into its bytes (GRYT-761).
   *
   * Absent for a channel, where nothing is sealed. Throws when the bytes will
   * not open, which for a file has no ordinary cause — a reader either has the
   * message's key or does not have the message.
   */
  openFile?: (ciphertext: Uint8Array, meta: SealedAttachmentKey) => Uint8Array;
  /** Which server to fetch a sealed attachment from. */
  host?: string | null;
}

/** A send that has gone out and not been answered. */
interface Attempt {
  timer: ReturnType<typeof setTimeout>;
  attempts: number;
  text: string;
  channelId: string;
  /** Kept so a retry sends the same files as the first attempt did, without
   *  uploading them a second time. */
  attachments?: string[] | null;
  /** Kept so a retry sends the same reply target as the first attempt did. */
  replyTo?: string | null;
}

/**
 * A channel's messages: the first page, the pages before it, whatever arrives
 * while you are looking, and whatever you say.
 *
 * **Pagination is a cursor on time, not an offset** — an offset skips or
 * repeats messages whenever one is posted while you scroll.
 *
 * **`hasMore` lies exactly once**: a history that is a multiple of the page
 * size reports more and the next request comes back empty, so an empty page is
 * treated as the end rather than trusting the flag.
 *
 * Sending draws the message first and reconciles after, which the nonce is what
 * makes possible. See `outbox.ts`.
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
  /* Refs, like the two above, so a redraw of the composer does not rebuild
   * `dispatch` and with it every retry timer hanging off it. */
  const sealRef = useRef(options.seal);
  sealRef.current = options.seal;
  const openRef = useRef(options.open);
  openRef.current = options.open;
  const reportedRef = useRef(options.onReported);
  reportedRef.current = options.onReported;

  /**
   * Message ids reported and not yet answered. **`chat:error` does not say what
   * it is about**, so the handler decides by what is outstanding — otherwise
   * reporting an eleventh message in a minute replaces the whole channel with
   * "Too fast".
   */
  const reporting = useRef(new Set<string>());

  const attempts = useRef(new Map<string, Attempt>());

  /**
   * Open whatever arrived sealed (GRYT-729). Here rather than in the history
   * and new-message handlers separately, which would be two copies racing each
   * other's `setMessages`. **`sealedState` goes to `opening` before the work
   * starts**, so a second pass does not start it again.
   */
  useEffect(() => {
    const open = options.open;
    const openFile = options.openFile;
    if (!open || !openFile) return;

    const pending = messages.filter((m) => m.sealed && !m.sealedState);
    if (pending.length === 0) return;

    const ids = new Set(pending.map((m) => m.message_id));
    setMessages((current) =>
      current.map((m) => (ids.has(m.message_id) ? { ...m, sealedState: "opening" } : m)),
    );

    let live = true;
    void Promise.all(
      pending.map(async (message) => {
        try {
          // `{ text, attachments }` since attachments could be sealed. Only
          // the text is drawn here; the files still go up in the clear, and the
          // key that would open them is sitting in `opened.attachments` waiting
          // for the upload path to catch up.
          const opened = await open(message.sealed as string);
          // Null is no wrapped key for us: a message from before we joined the
          // conversation. Permanent, ordinary, and not an error.
          if (!opened) {
            return { id: message.message_id, text: null, state: "locked" as const, enriched: null };
          }

          /*
           * The files, decrypted onto disk where an `Image` can reach them
           * (GRYT-761). Here rather than in the row, where a fetch on render
           * repeats on every re-render. `allSettled`, so one attachment that
           * will not open does not fail the message.
           */
          const fileIds = message.attachments ?? [];
          const settled = await Promise.allSettled(
            fileIds.map(async (fileId) => {
              const key = opened.attachments[fileId];
              // No key means it went up in the clear, which is every attachment
              // sent before this shipped. The server's own metadata describes it.
              if (!key) return null;

              const localUri = await materialiseSealedAttachment({
                url: attachmentUrl(options.host ?? "", fileId),
                fileId,
                key,
                openFile,
              });
              return sealedAttachmentMeta(fileId, key, localUri);
            }),
          );

          const enriched = fileIds.map((fileId, i) => {
            const result = settled[i];
            if (result.status === "fulfilled" && result.value) return result.value;
            // Either it was never sealed, or it would not open. Fall back to
            // what the server says, which for a sealed file is an unnamed
            // octet-stream — visibly broken rather than invisibly absent.
            return message.enriched_attachments?.[i] ?? { file_id: fileId };
          });

          return {
            id: message.message_id,
            text: opened.text,
            state: "open" as const,
            enriched: enriched.length > 0 ? enriched : null,
          };
        } catch {
          // A key that is there and does not open. Tampering, or the wrong
          // conversation. Drawn as broken rather than as an empty message.
          return { id: message.message_id, text: null, state: "broken" as const, enriched: null };
        }
      }),
    ).then((opened) => {
      if (!live) return;
      const byId = new Map(opened.map((o) => [o.id, o]));
      setMessages((current) =>
        current.map((m) => {
          const result = byId.get(m.message_id);
          if (!result) return m;
          return {
            ...m,
            text: result.text,
            sealedState: result.state,
            ...(result.enriched ? { enriched_attachments: result.enriched } : null),
          };
        }),
      );
    });

    return () => {
      live = false;
    };
  }, [messages, options.open, options.openFile, options.host]);

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

      /* A report in flight claims the error before anything else does. It is
       * the only one of the three whose failure has nowhere of its own to
       * land: a send has the grey message, a fetch has the channel, and a
       * refused report would otherwise replace a channel somebody is reading
       * with the rate limiter's own words. */
      if (reporting.current.size > 0) {
        reporting.current.clear();
        reportedRef.current?.("refused", text);
        return;
      }

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
     * **`server:error` is where an unusable token lands, and it is not
     * `chat:error`.** Without this a send with an expired token gets no answer
     * and sits grey until the timeout. Restoring the session is GRYT-415.
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
     * A reconnect has to ask again — what was said while the socket was down is
     * only in the server's copy. **The list is not cleared and `loading` is not
     * set**: a channel that blanks every time a phone changes cell is worse
     * than one briefly stale.
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
    const onReportSubmitted = ({ messageId }: { messageId?: string }) => {
      if (cancelled) return;
      if (messageId) reporting.current.delete(messageId);
      reportedRef.current?.("submitted");
    };

    const onAlreadyReported = ({ messageId }: { messageId?: string }) => {
      if (cancelled) return;
      if (messageId) reporting.current.delete(messageId);
      reportedRef.current?.("already");
    };

    socket.on("chat:error", onError);
    socket.on("report:submitted", onReportSubmitted);
    socket.on("report:already_reported", onAlreadyReported);
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
      socket.off("report:submitted", onReportSubmitted);
      socket.off("report:already_reported", onAlreadyReported);
      socket.off("server:error", onServerError);
    };
  }, [socket, channelId]);

  /**
   * A draft that has stopped being pending has been answered, so its clock can
   * stop. **Driven off the list rather than each handler**: there are four ways
   * for a send to settle, and a timer left behind any one resends a message
   * that had already arrived.
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
    async (
      nonce: string,
      text: string,
      channel: string,
      attempt: number,
      replyTo?: string | null,
      attachments?: string[] | null,
      /**
       * The file keys, by the id the server gave each upload (GRYT-761).
       * **Carried through the retries**, or a resend names uploads nobody has
       * the key to and draws as a broken file rather than a failed send.
       */
      attachmentKeys?: Record<string, SealedAttachmentKey> | null,
    ) => {
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

      /*
       * Sealed or in the clear, never both — the server refuses a payload
       * carrying each (GRYT-729).
       *
       * **A failure to seal sends nothing rather than falling back.** Somebody
       * typing into a conversation the composer calls encrypted must not have
       * it go out in the open because a derivation threw.
       */
      let sealed: string | null = null;
      if (sealRef.current) {
        try {
          sealed = await sealRef.current(text, attachmentKeys ?? undefined);
        } catch {
          setMessages((current) =>
            markFailed(current, nonce, "Could not encrypt this message."),
          );
          return;
        }
      }

      socket.emit("chat:send", {
        conversationId: channel,
        accessToken,
        ...(sealed ? { sealed } : { text }),
        nonce,
        /* Same reasoning as the reply id below: omitted rather than null, since
         * the handler reads it as optional. */
        ...(attachments?.length ? { attachments } : null),
        /* Omitted rather than sent as null when there is nothing to reply to.
         * The handler reads it as optional and a null would be stored. */
        ...(replyTo ? { replyToMessageId: replyTo } : null),
      });

      const timer = setTimeout(() => {
        if (attempt < SEND_ATTEMPTS) {
          void dispatch(nonce, text, channel, attempt + 1, replyTo, attachments, attachmentKeys);
          return;
        }
        attempts.current.delete(nonce);
        setMessages((current) => markFailed(current, nonce, "Not delivered."));
      }, SEND_TIMEOUT_MS);

      clearAttempt(nonce);
      attempts.current.set(nonce, {
        timer,
        attempts: attempt,
        text,
        channelId: channel,
        replyTo,
        attachments,
      });
    },
    [socket, clearAttempt],
  );

  const send = useCallback(
    (
      raw: string,
      replyTo?: string | null,
      files?: {
        ids: string[];
        localUris: string[];
        keys?: Record<string, SealedAttachmentKey> | null;
      } | null,
    ) => {
      const text = raw.trim();
      /* Either is enough on its own. A picture with no words is a message, and
       * the server agrees — it refuses only when both are missing. */
      if ((!text && !files?.ids.length) || !socket || !channelId) return;

      const nonce = Crypto.randomUUID();
      setMessages((current) => [
        ...current,
        /* The draft carries the reply id too, so the stub is drawn the moment
         * Send is pressed rather than appearing when the server echoes it
         * back. The real message replaces this one in place.
         *
         * The attachments on it are the **local** uris, so the picture is on
         * screen from the same moment. The echo carries the server's
         * `enriched_attachments` and replaces the whole row. */
        {
          ...draftMessage({
            channelId,
            text,
            nonce,
            me: meRef.current,
            attachments: files?.localUris ?? null,
          }),
          reply_to_message_id: replyTo ?? null,
        },
      ]);
      void dispatch(nonce, text, channelId, 1, replyTo, files?.ids ?? null, files?.keys ?? null);
    },
    [socket, channelId, dispatch],
  );

  const retry = useCallback(
    (nonce: string) => {
      if (!socket || !channelId) return;
      const failed = messagesRef.current.find((m) => m.nonce === nonce);
      const previous = attempts.current.get(nonce);
      /* A message with only a picture in it has no text, and used to be
       * unretryable for that reason alone. */
      if (!failed || (!failed.text && !previous?.attachments?.length)) return;
      setMessages((current) => markSending(current, nonce));
      void dispatch(
        nonce,
        failed.text ?? "",
        channelId,
        1,
        previous?.replyTo,
        /* The files are already on the server — the id is what failed to be
         * delivered, not the upload. Re-uploading would leave an orphan. */
        previous?.attachments,
      );
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

  /**
   * The three that only exist on the server. **None draws anything locally** —
   * each is answered by a broadcast carrying the whole message, and an
   * optimistic version is a second answer to a settled question.
   */
  const act = useCallback(
    async (event: string, payload: Record<string, unknown>) => {
      if (!socket || !channelId) return;
      const accessToken = await tokenRef.current();
      if (!accessToken) return;
      socket.emit(event, { conversationId: channelId, accessToken, ...payload });
    },
    [socket, channelId],
  );

  const react = useCallback(
    (messageId: string, src: string) => void act("chat:react", { messageId, reactionSrc: src }),
    [act],
  );

  const edit = useCallback(
    (messageId: string, text: string) => {
      const body = text.trim();
      if (!body) return;
      void act("chat:edit", { messageId, text: body });
    },
    [act],
  );

  const remove = useCallback(
    (messageId: string) => void act("chat:delete", { messageId }),
    [act],
  );

  const report = useCallback(
    (messageId: string) => {
      reporting.current.add(messageId);
      void act("chat:report", { messageId });
    },
    [act],
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
    react,
    edit,
    remove,
    report,
  };
}
