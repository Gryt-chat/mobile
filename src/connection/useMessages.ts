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
import { type EmitResult, type QueueSocket, SendQueue } from "./sendQueue";
import {
  discardDraft,
  draftMessage,
  hasPending,
  markFailed,
  markLatestFailed,
  markRefused,
  markSending,
  receiveFirstPage,
  receiveMessage,
  type LocalMessage,
} from "./outbox";
import type { ChatHistory, Message, ThreadSummary } from "./types";
import { errorText, goneFromError, type ThreadGone, type ThreadUpdate } from "../threads/threads";

/** What the server defaults to, stated here so the cursor maths matches it. */
const PAGE = 50;

/** How opening history at a message went. "unsupported" is a server older than 1.10.57. */
export type OpenAtResult = "window" | "unsupported" | "missing";
const OPEN_TIMEOUT_MS = 8000;

/** What a send that ran out of time says on its row. */
const NOT_DELIVERED = "Not delivered.";

export interface MessagesState {
  messages: LocalMessage[];
  loading: boolean;
  /** More history exists further back. */
  hasMore: boolean;
  loadingMore: boolean;
  error: string | null;
  /** Ask for the page before the oldest message held. */
  loadOlder: () => void;
  /** Showing older messages opened at one of them, with the present further down (GRYT-1686). */
  detached: boolean;
  loadingNewer: boolean;
  /** Ask for the page after the newest message held, while detached. */
  loadNewer: () => void;
  /** Open history at a message that isn't loaded. */
  openAt: (messageId: string) => Promise<OpenAtResult>;
  /** Back to the newest messages, with any unsent ones. */
  returnToPresent: () => void;
  /** Counts history pages, so the list can tell a page from a message arriving. */
  pages: number;
  /**
   * Draw a message and send it. Empty text does nothing. `replyTo` is a message
   * id the server hangs the new message off.
   */
  send: (
    text: string,
    replyTo?: string | null,
    /**
     * Files already uploaded, plus where they came from. `ids` goes to the
     * server; `localUris` is what the draft draws. `keys` is `sealAttachment`'s.
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
   * `chat:reaction` comes back with the whole message.
   */
  react: (messageId: string, src: string) => void;
  /** Change what a message says. Yours only; the server checks again. */
  edit: (messageId: string, text: string) => void;
  /** Remove a message. Yours, or anybody's if the server lets you. */
  remove: (messageId: string) => void;
  /** Pin or unpin; answered by a `chat:pinned` broadcast (GRYT-1619). */
  pin: (messageId: string, pinned: boolean) => void;
  /**
   * Report somebody else's message to whoever runs the server. Fire and forget;
   * the answer arrives as `report:submitted` or `report:already_reported`.
   */
  report: (messageId: string, mls?: { senderServerUserId: string; text: string }) => void;
  /** The thread being read, once the server has sent it. Null for a channel. */
  thread: ThreadSummary | null;
  /** The message the thread hangs off. Null until the first page, or when it is gone. */
  root: LocalMessage | null;
  /** Set when the thread went while it was open, or was not there when asked. */
  gone: ThreadGone;
}

/** What `thread:history` carries: a page of replies, plus the thread and its root on the first. */
interface ThreadHistory extends ChatHistory {
  thread: ThreadSummary;
  root: Message | null;
}

export interface MessagesOptions {
  /** The token `chat:send` carries, refreshed if it is due. */
  getAccessToken: () => Promise<string | null>;
  /**
   * What happened to a report, so the screen can say so. A callback rather than a
   * toast: this hook holds the socket and the message list and nothing that draws.
   */
  onReported?: (outcome: "submitted" | "already" | "refused", message?: string) => void;
  /** Who we are here, so a message drawn early carries the right sender. */
  me: SessionIdentity | null;
  /**
   * Turn a message into an envelope, or null to send it in the clear. Passed in,
   * because the composer has to say so before send. Absent for a channel.
   */
  seal?: (
    plaintext: string,
    attachments?: Record<string, SealedAttachmentKey>,
  ) => Promise<string | null>;
  /**
   * Open an envelope, or null when there is no wrapped key for us. Throws when a
   * key is there and does not open — see `sealedState`.
   */
  open?: (sealed: string) => Promise<OpenedMessage | null>;
  /**
   * Turn a downloaded attachment back into its bytes. Absent for a channel.
   * Throws when the bytes will not open, which for a file has no ordinary cause.
   */
  openFile?: (ciphertext: Uint8Array, meta: SealedAttachmentKey) => Uint8Array;
  /** Which server to fetch a sealed attachment from. */
  host?: string | null;
  /** Read and post in this thread of `channelId` instead of its timeline. */
  threadId?: string | null;
}

/** A send not yet confirmed, kept whole so every attempt and a retry send the same thing. */
interface Outgoing {
  text: string;
  channelId: string;
  /** Sealed once when sent. Sealed again later it can come out different, or not at all. */
  sealed: string | null;
  /** The same files and reply target on every attempt, uploaded once. */
  attachments?: string[] | null;
  replyTo?: string | null;
  threadId?: string | null;
  /** Set when an attempt could not be built, and said on the row when it fails. */
  failure?: string;
}

/**
 * A channel's messages. **Pagination is a cursor on time, not an offset**, and
 * **`hasMore` lies exactly once**, so an empty page is treated as the end.
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
  const threadId = options.threadId ?? null;
  const [thread, setThread] = useState<ThreadSummary | null>(null);
  const [root, setRoot] = useState<LocalMessage | null>(null);
  const [gone, setGone] = useState<ThreadGone>(null);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const rootRef = useRef(root);
  rootRef.current = root;

  // Read inside the callback rather than depended on, so asking for an older
  // page does not rebuild the listeners and lose the ones already attached.
  const oldest = useRef<string | null>(null);
  const pending = useRef(false);
  const newest = useRef<string | null>(null);
  const pendingNewer = useRef(false);
  const [detached, setDetached] = useState(false);
  const detachedRef = useRef(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [pages, setPages] = useState(0);
  const aroundRef = useRef<{ id: string; resolve: (r: OpenAtResult) => void; timer: ReturnType<typeof setTimeout> } | null>(null);
  // Unsent messages belong to the present, so they wait aside while an older window is shown.
  const draftsAside = useRef<LocalMessage[]>([]);

  /* `me` and the token change on every refresh, which is every ten minutes. Held
   * in refs so that does not tear down the listeners. */
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
   * Message ids reported and not yet answered. **`chat:error` does not say what it
   * is about**, so the handler decides by what is outstanding.
   */
  const reporting = useRef(new Set<string>());

  const outgoing = useRef(new Map<string, Outgoing>());
  const queueRef = useRef<SendQueue | null>(null);

  /**
   * Open whatever arrived sealed. Here rather than in two handlers racing each
   * other. **`sealedState` goes to `opening` before the work starts.**
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
          // `{ text, attachments }` since attachments could be sealed. Only the
          // text is drawn here; the files still go up in the clear.
          const opened = await open(message.sealed as string);
          // Null is no wrapped key for us: a message from before we joined the
          // conversation. Permanent, ordinary, and not an error.
          if (!opened) {
            return { id: message.message_id, text: null, state: "locked" as const, enriched: null };
          }

          /*
           * The files, decrypted onto disk where an `Image` can reach them. Here
           * rather than in the row; `allSettled`, so one bad file is not fatal.
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
            // Either it was never sealed, or it would not open. Fall back to what
            // the server says — visibly broken rather than invisibly absent.
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

  /* One queue per socket, which socket.io keeps across a reconnect: a send waits
   * out a drop or a restart and goes once the server knows who this is (GRYT-1453). */
  useEffect(() => {
    if (!socket) return;
    const queue = new SendQueue(socket as unknown as QueueSocket, {
      emit: async (nonce): Promise<EmitResult> => {
        const entry = outgoing.current.get(nonce);
        if (!entry) return "failed";
        if (!socket.connected) return "offline";
        const accessToken = await tokenRef.current();
        if (!accessToken) {
          entry.failure = "Not signed in to this server.";
          return "failed";
        }
        // The guard would queue it and send it ahead of the restore, to a socket nobody knows.
        if (!socket.connected) return "offline";
        socket.emit("chat:send", {
          conversationId: entry.channelId,
          accessToken,
          ...(entry.sealed ? { sealed: entry.sealed } : { text: entry.text }),
          nonce,
          // Omitted rather than null when absent: the handler reads both as optional.
          ...(entry.attachments?.length ? { attachments: entry.attachments } : null),
          ...(entry.replyTo ? { replyToMessageId: entry.replyTo } : null),
          ...(entry.threadId ? { threadId: entry.threadId } : null),
        });
        return "sent";
      },
      onGiveUp: (nonce) => {
        const failure = outgoing.current.get(nonce)?.failure ?? NOT_DELIVERED;
        setMessages((current) => markFailed(current, nonce, failure));
      },
      onWaiting: (nonce, waiting) =>
        setMessages((current) =>
          current.some((m) => m.nonce === nonce && m.pending && !!m.waiting !== waiting)
            ? current.map((m) => (m.nonce === nonce && m.pending ? { ...m, waiting } : m))
            : current,
        ),
    });
    queueRef.current = queue;
    return () => {
      queueRef.current = null;
      queue.dispose();
    };
  }, [socket]);

  /** Refused for good: the queue stops sending it. Without a nonce, the newest one waiting. */
  const settleRefused = useCallback((nonce?: string) => {
    const refused =
      nonce ?? [...messagesRef.current].reverse().find((m) => m.pending && m.nonce)?.nonce;
    if (refused) queueRef.current?.settle(refused);
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
    newest.current = null;
    pendingNewer.current = false;
    detachedRef.current = false;
    setDetached(false);
    setLoadingNewer(false);
    draftsAside.current = [];
    if (aroundRef.current) {
      clearTimeout(aroundRef.current.timer);
      aroundRef.current.resolve("unsupported");
      aroundRef.current = null;
    }
    setMessages([]);
    setError(null);
    setLoading(true);
    setThread(null);
    setRoot(null);
    setGone(null);
    /* Deleted while a page was on its way, so the page cannot put them back. */
    const deleted = new Set<string>();

    const onHistory = (history: ChatHistory) => {
      // Every channel's history arrives on the same event, so a page for the
      // channel you just left would otherwise land in the one you are in.
      if (cancelled || history.conversation_id !== channelId) return;
      if (threadId) {
        const page = history as ThreadHistory;
        if (page.thread?.thread_id !== threadId) return;
        setThread((held) => ({ ...held, ...page.thread }));
        if (page.before === undefined) setRoot(page.root);
      }

      const items = history.items ?? [];
      setPages((n) => n + 1);

      const open = aroundRef.current;
      if (history.around !== undefined) {
        if (!open || history.around !== open.id) return;
        clearTimeout(open.timer);
        aroundRef.current = null;
        setLoading(false);
        if (!history.anchorFound) return open.resolve("missing");
        const kept = items.filter((m) => !deleted.has(m.message_id));
        oldest.current = kept[0]?.created_at ?? null;
        newest.current = kept[kept.length - 1]?.created_at ?? null;
        setHasMore(kept.length > 0 && history.hasMore);
        detachedRef.current = !!history.hasNewer;
        setDetached(detachedRef.current);
        if (detachedRef.current) {
          draftsAside.current = messagesRef.current.filter((m) => m.pending || m.failed);
          setMessages(kept);
        } else {
          setMessages((current) => receiveFirstPage(current, kept, deleted));
        }
        return open.resolve("window");
      }

      if (history.after !== undefined) {
        if (!detachedRef.current) return;
        pendingNewer.current = false;
        setLoadingNewer(false);
        const kept = items.filter((m) => !deleted.has(m.message_id));
        if (kept.length) newest.current = kept[kept.length - 1].created_at;
        const reachedPresent = !history.hasNewer;
        if (reachedPresent) {
          detachedRef.current = false;
          setDetached(false);
        }
        const aside = reachedPresent ? draftsAside.current : [];
        if (reachedPresent) draftsAside.current = [];
        setMessages((current) => {
          const held = new Set(current.map((m) => m.message_id));
          return [...current, ...kept.filter((m) => !held.has(m.message_id)), ...aside];
        });
        return;
      }

      // An older server answers `around` with the newest page, as if nothing was asked for.
      if (open && history.before === undefined) {
        clearTimeout(open.timer);
        aroundRef.current = null;
        open.resolve("unsupported");
      }

      // Oldest first from the server, which is the order they are rendered in.
      const older = history.before !== undefined;

      setMessages((current) => {
        if (older) return [...items.filter((m) => !deleted.has(m.message_id)), ...current];
        // A first page arriving does not throw away what has been said since —
        // a draft, or a message that came in while it was in flight.
        return receiveFirstPage(current, items, deleted);
      });
      // An empty page means the end regardless of what `hasMore` claims.
      setHasMore(items.length > 0 && history.hasMore);
      // A first page after a reconnect is newer than what is already held further back.
      const first = items[0]?.created_at;
      if (first && (!oldest.current || Date.parse(first) < Date.parse(oldest.current))) oldest.current = first;

      setLoading(false);
      setLoadingMore(false);
      pending.current = false;
    };

    const onNew = (message: Message & { nonce?: string }) => {
      if (message.nonce) outgoing.current.delete(message.nonce);
      if (cancelled || message.conversation_id !== channelId) return;
      // A thread's replies stay out of the timeline, and the timeline out of a thread.
      if ((message.thread_id ?? null) !== threadId) return;
      // It belongs at the present, which the newer pages reach when you scroll down.
      if (detachedRef.current) return;
      setMessages((current) => receiveMessage(current, message, meRef.current));
    };

    const onEdited = (message: Message) => {
      if (cancelled || message.conversation_id !== channelId) return;
      setMessages((current) =>
        current.map((m) => (m.message_id === message.message_id ? message : m)),
      );
      // The root sits above the replies and is held apart from them.
      setRoot((held) => (held?.message_id === message.message_id ? message : held));
    };

    /* A pin carries only the message id, so the row keeps everything else. */
    const onPinned = (p: { conversation_id?: string; message_id?: string; pinned_at?: string | null; pinned_by?: string | null }) => {
      if (cancelled || p?.conversation_id !== channelId || !p.message_id) return;
      const apply = (m: Message) =>
        m.message_id === p.message_id ? { ...m, pinned_at: p.pinned_at ?? null, pinned_by: p.pinned_by ?? null } : m;
      setMessages((current) => current.map(apply));
      setRoot((held) => (held ? apply(held) : held));
    };

    /* The worker finished with a message's attachments: same message, settled files. */
    const onAttachments = (payload: { conversation_id?: string; message_id?: string; enriched_attachments?: Message["enriched_attachments"] }) => {
      if (cancelled || payload?.conversation_id !== channelId || !payload.message_id || !Array.isArray(payload.enriched_attachments)) return;
      const apply = (m: Message) =>
        m.message_id === payload.message_id ? { ...m, enriched_attachments: payload.enriched_attachments } : m;
      setMessages((current) => current.map(apply));
      setRoot((held) => (held ? apply(held) : held));
    };

    const onDeleted = ({
      conversation_id,
      message_id,
    }: {
      conversation_id: string;
      message_id: string;
    }) => {
      if (cancelled || conversation_id !== channelId) return;
      deleted.add(message_id);
      setMessages((current) => current.filter((m) => m.message_id !== message_id));
      // Deleting the root takes the thread with it on the server.
      if (threadId && rootRef.current?.message_id === message_id) setGone("deleted");
    };

    const onError = (
      payload: string | { message?: string; error?: string },
      ref?: { nonce?: string },
    ) => {
      if (cancelled) return;
      // A refusal naming a send another list made, such as a thread's, is not about this one.
      if (ref?.nonce && !messagesRef.current.some((m) => m.nonce === ref.nonce)) return;
      const text =
        typeof payload === "string"
          ? payload
          : payload?.message || payload?.error || "The server refused the request.";

      /* A report in flight claims the error first: it is the only one of the three
       * whose failure has nowhere of its own to land. */
      if (reporting.current.size > 0) {
        reporting.current.clear();
        reportedRef.current?.("refused", text);
        return;
      }

      /* `chat:error` covers both directions and says which only by what is
       * outstanding. A refused send is reported on the message itself. */
      if (hasPending(messagesRef.current)) {
        const nonce = ref && typeof ref.nonce === "string" ? ref.nonce : undefined;
        settleRefused(nonce);
        setMessages((current) => markRefused(current, text, nonce));
        return;
      }

      setError(text);
      setLoading(false);
      setLoadingMore(false);
      pending.current = false;
    };

    /**
     * **`server:error` is where an unusable token lands, and it is not
     * `chat:error`.** Without this a send with an expired token sits grey.
     */
    const onServerError = (payload: { error?: string; message?: string }) => {
      if (cancelled || !hasPending(messagesRef.current)) return;
      settleRefused();
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
     * A reconnect has to ask again. **The list is not cleared and `loading` is not
     * set**: a channel that blanks on every cell change is worse than stale.
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
      fetchPage(socket, channelId, threadId);
    };

    const onThreadUpdated = (update: ThreadUpdate) => {
      if (cancelled || update?.thread_id !== threadId) return;
      setThread((held) => (held ? { ...held, ...update } : held));
    };

    const onThreadDeleted = (p: { thread_id?: string }) => {
      if (!cancelled && p?.thread_id === threadId) setGone("deleted");
    };

    /* Only a fetch's refusal is drawn here. One for a status change is the screen's to say. */
    const onThreadError = (payload: unknown) => {
      if (cancelled) return;
      const missing = goneFromError(payload);
      if (missing) {
        setGone(missing);
        setLoading(false);
        return;
      }
      if (!pending.current && !loadingRef.current) return;
      setError(errorText(payload));
      setLoading(false);
      setLoadingMore(false);
      pending.current = false;
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on(threadId ? "thread:history" : "chat:history", onHistory);
    if (threadId) {
      socket.on("thread:updated", onThreadUpdated);
      socket.on("thread:deleted", onThreadDeleted);
      socket.on("thread:error", onThreadError);
    }
    socket.on("chat:new", onNew);
    socket.on("chat:edited", onEdited);
    // A reaction re-broadcasts the whole message, so it is an edit here.
    socket.on("chat:reaction", onEdited);
    socket.on("chat:deleted", onDeleted);
    socket.on("chat:attachments", onAttachments);
    socket.on("chat:pinned", onPinned);
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

    fetchPage(socket, channelId, threadId);

    return () => {
      cancelled = true;
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off(threadId ? "thread:history" : "chat:history", onHistory);
      socket.off("thread:updated", onThreadUpdated);
      socket.off("thread:deleted", onThreadDeleted);
      socket.off("thread:error", onThreadError);
      socket.off("chat:new", onNew);
      socket.off("chat:edited", onEdited);
      socket.off("chat:reaction", onEdited);
      socket.off("chat:deleted", onDeleted);
      socket.off("chat:attachments", onAttachments);
      socket.off("chat:pinned", onPinned);
      socket.off("chat:error", onError);
      socket.off("report:submitted", onReportSubmitted);
      socket.off("report:already_reported", onAlreadyReported);
      socket.off("server:error", onServerError);
    };
  }, [socket, channelId, threadId, settleRefused]);

  const returnToPresent = useCallback(() => {
    if (!socket || !channelId || !detachedRef.current) return;
    detachedRef.current = false;
    setDetached(false);
    setLoadingNewer(false);
    pendingNewer.current = false;
    oldest.current = null;
    newest.current = null;
    setMessages(draftsAside.current);
    draftsAside.current = [];
    fetchPage(socket, channelId, threadId);
  }, [socket, channelId, threadId]);

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
      // Sent from an older window: back to the present, where it will appear.
      if (detachedRef.current) returnToPresent();

      const nonce = Crypto.randomUUID();
      setMessages((current) => [
        ...current,
        /* The draft carries the reply id too, so the stub is drawn the moment Send is
         * pressed. Its attachments are local uris, and the echo replaces the whole row. */
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
      void (async () => {
        /* Sealed or in the clear, never both, and sealed now rather than per attempt. A
         * failure to seal sends nothing rather than falling back. */
        let sealed: string | null = null;
        if (sealRef.current) {
          try {
            sealed = await sealRef.current(text, files?.keys ?? undefined);
          } catch {
            setMessages((current) => markFailed(current, nonce, "Could not encrypt this message."));
            return;
          }
        }
        outgoing.current.set(nonce, {
          text,
          channelId,
          sealed,
          attachments: files?.ids ?? null,
          replyTo,
          threadId,
        });
        queueRef.current?.add(nonce);
      })();
    },
    [socket, channelId, threadId],
  );

  const retry = useCallback(
    (nonce: string) => {
      if (!socket || !channelId) return;
      const failed = messagesRef.current.find((m) => m.nonce === nonce);
      const previous = outgoing.current.get(nonce);
      /* A message with only a picture in it has no text, and used to be
       * unretryable for that reason alone. */
      if (!failed || !previous || (!failed.text && !previous.attachments?.length)) return;
      previous.failure = undefined;
      setMessages((current) => markSending(current, nonce));
      // The same envelope, files and reply target: the files are already up, and the nonce dedupes.
      queueRef.current?.add(nonce);
    },
    [socket, channelId],
  );

  const discard = useCallback(
    (nonce: string) => {
      queueRef.current?.settle(nonce);
      outgoing.current.delete(nonce);
      setMessages((current) => discardDraft(current, nonce));
    },
    [],
  );

  /**
   * The three that only exist on the server. **None draws anything locally** —
   * each is answered by a broadcast carrying the whole message.
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

  const pin = useCallback(
    (messageId: string, pinned: boolean) => void act("chat:pin", { messageId, pinned }),
    [act],
  );

  const report = useCallback(
    (messageId: string, mls?: { senderServerUserId: string; text: string }) => {
      reporting.current.add(messageId);
      // The server has no copy of an MLS message, so this phone sends its own, shown as unverified.
      void act("chat:report", mls ? { messageId, mls } : { messageId });
    },
    [act],
  );

  const loadNewer = useCallback(() => {
    if (!socket || !channelId || threadId || !detachedRef.current || pendingNewer.current || !newest.current) return;
    pendingNewer.current = true;
    setLoadingNewer(true);
    socket.emit("chat:fetch", { conversationId: channelId, limit: PAGE, after: newest.current });
  }, [socket, channelId, threadId]);

  const openAt = useCallback(
    (messageId: string): Promise<OpenAtResult> => {
      if (!socket || !channelId || threadId) return Promise.resolve("unsupported");
      if (aroundRef.current) {
        clearTimeout(aroundRef.current.timer);
        aroundRef.current.resolve("unsupported");
      }
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (aroundRef.current?.id !== messageId) return;
          aroundRef.current = null;
          resolve("unsupported");
        }, OPEN_TIMEOUT_MS);
        aroundRef.current = { id: messageId, resolve, timer };
        socket.emit("chat:fetch", { conversationId: channelId, limit: PAGE, around: messageId });
      });
    },
    [socket, channelId, threadId],
  );


  const loadOlder = useCallback(() => {
    // One page in flight at a time. A list near its top fires this on every
    // frame otherwise, and the server rate-limits `chat:fetch`.
    if (!socket || !channelId || pending.current || !hasMore || !oldest.current) return;
    pending.current = true;
    setLoadingMore(true);
    fetchPage(socket, channelId, threadId, oldest.current);
  }, [socket, channelId, threadId, hasMore]);

  return {
    messages,
    loading,
    hasMore,
    loadingMore,
    error,
    loadOlder,
    detached,
    loadingNewer,
    loadNewer,
    openAt,
    returnToPresent,
    pages,
    send,
    retry,
    discard,
    react,
    edit,
    remove,
    pin,
    report,
    thread,
    root,
    gone,
  };
}

/** A page of the timeline, or of one thread in it. Both are a cursor on time. */
function fetchPage(socket: Socket, conversationId: string, threadId: string | null, before?: string) {
  const page = { conversationId, limit: PAGE, ...(before ? { before } : null) };
  if (threadId) socket.emit("thread:fetch", { ...page, threadId });
  else socket.emit("chat:fetch", page);
}
