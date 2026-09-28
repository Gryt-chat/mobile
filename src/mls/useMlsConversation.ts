import type { DmSealingMode, MlsDmContent as MlsContent } from "@gryt/core";
import { openAttachment, type SealedAttachmentKey } from "@gryt/crypto";
import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { openLocalArchive } from "../archive/localArchive";
import type { SessionIdentity } from "../connection/claims";
import { draftMessage, type LocalMessage } from "../connection/outbox";
import { useMlsSession } from "./registry";
import type { ConversationProblems } from "./session";
import { attachmentUrl, sealedAttachmentMeta } from "../chat/files";
import { materialiseSealedAttachment } from "../chat/sealedAttachments";
import { archivedRow, newMessage, sendFailure, withOpenedFiles } from "./timeline";

const PAGE = 50;
/** Coalesces a catch-up's hundreds of archive writes into a few redraws. */
const RELOAD_DEBOUNCE_MS = 150;

const MODE_RETRY_MS = 5000;

const NO_PROBLEMS: ConversationProblems = { undecryptable: 0, lost: null };

export interface MlsConversation {
  /** Null while it's being worked out, and for anything that isn't a one-to-one DM. */
  mode: DmSealingMode | null;
  /** A DM whose mode isn't known yet. Sending now could seal to somebody already on MLS. */
  waiting: boolean;
  /** MLS messages from the archive, and sends not yet through. */
  rows: LocalMessage[];
  hasMore: boolean;
  loadOlder: () => void;
  problems: ConversationProblems;
  lostHistory: boolean;
  /** `files` is what the composer uploaded, sealed, with the keys `sealFile` gave back. */
  send: (
    text: string,
    replyTo?: string | null,
    files?: { ids: string[]; localUris: string[]; keys?: Record<string, SealedAttachmentKey> | null } | null,
  ) => void;
  edit: (messageId: string, text: string) => void;
  remove: (messageId: string) => void;
  retry: (nonce: string) => void;
  discard: (nonce: string) => void;
}

/** One DM on MLS: its mode, its archived messages and its sends (design, sections 5 and 6). */
export function useMlsConversation({
  host,
  conversationId,
  peer,
  me,
  nameFor,
}: {
  host: string;
  conversationId: string | null;
  /** The other person, only for a one-to-one DM. Groups are stage 2. */
  peer: string | null;
  me: SessionIdentity | null;
  nameFor: (id: string) => string | undefined;
}): MlsConversation {
  const session = useMlsSession(host);
  const [mode, setMode] = useState<DmSealingMode | null>(null);
  const [archived, setArchived] = useState<LocalMessage[]>([]);
  const [limit, setLimit] = useState(PAGE);
  const [hasMore, setHasMore] = useState(false);
  const [drafts, setDrafts] = useState<LocalMessage[]>([]);
  const [problems, setProblems] = useState<ConversationProblems>(NO_PROBLEMS);
  const [lostHistory, setLostHistory] = useState(false);
  const [opened, setOpened] = useState<ReadonlyMap<string, NonNullable<LocalMessage["enriched_attachments"]>[number] | "failed">>(new Map());
  /** Each file's key, from the archive, and the ones already being fetched. */
  const fileKeys = useRef(new Map<string, SealedAttachmentKey>());
  const opening = useRef(new Set<string>());
  const outgoing = useRef(new Map<string, MlsContent>());
  const nameRef = useRef(nameFor);
  nameRef.current = nameFor;
  const meRef = useRef(me);
  meRef.current = me;

  const active = !!(session && conversationId && peer);

  useEffect(() => {
    setMode(null);
    setArchived([]);
    setDrafts([]);
    setLimit(PAGE);
    setOpened(new Map());
    opening.current.clear();
    fileKeys.current.clear();
    outgoing.current.clear();
  }, [host, conversationId]);

  // The mode, again whenever the session says something moved.
  useEffect(() => {
    if (!session || !conversationId || !peer) return;
    let live = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (retry) clearTimeout(retry);
      session
        .modeFor(conversationId, peer)
        .then((next) => live && setMode(next))
        .catch((e: unknown) => {
          console.warn("[MLS] Couldn't tell how to send here:", e);
          if (live) retry = setTimeout(refresh, MODE_RETRY_MS);
        });
      setProblems(session.problems(conversationId));
    };
    refresh();
    const off = session.onChange((id) => {
      if (id === null || id === conversationId) refresh();
    });
    return () => {
      live = false;
      if (retry) clearTimeout(retry);
      off();
    };
  }, [session, conversationId, peer]);

  // This phone's copy, reloaded a little after each change so a catch-up draws in batches.
  useEffect(() => {
    if (!session || !conversationId) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let off = () => {};
    void openLocalArchive().then((archive) => {
      if (!live) return;
      setLostHistory(archive.lostHistory);
      const load = async () => {
        const page = await archive.messages.page(session.storeScope, conversationId, { limit });
        if (!live) return;
        for (const m of page) for (const [fileId, key] of Object.entries(m.attachments)) fileKeys.current.set(fileId, key);
        setArchived(page.map((m) => archivedRow(m, (id) => nameRef.current(id))));
        setHasMore(page.length === limit);
      };
      void load();
      off = archive.messages.onChange((change) => {
        if (change.scope !== session.storeScope || change.conversationId !== conversationId) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void load(), RELOAD_DEBOUNCE_MS);
      });
    });
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
      off();
    };
  }, [session, conversationId, limit]);

  const dispatch = useCallback(
    (nonce: string, content: MlsContent) => {
      if (!session || !conversationId || !peer) return;
      session.send(conversationId, peer, content).then(
        // The draft stays until the archive's copy is drawn, so the row never blinks out.
        () => outgoing.current.delete(nonce),
        (e: unknown) => {
          console.warn("[MLS] Send failed:", e);
          const failure = sendFailure(e);
          setDrafts((current) =>
            current.map((m) => (m.nonce === nonce ? { ...m, pending: false, failed: true, failure } : m)),
          );
        },
      );
    },
    [session, conversationId, peer],
  );

  const send = useCallback<MlsConversation["send"]>(
    (raw, replyTo, files) => {
      const text = raw.trim();
      if ((!text && !files?.ids.length) || !conversationId) return;
      const nonce = Crypto.randomUUID();
      const content = newMessage(nonce, text, replyTo, files);
      const draft: LocalMessage = {
        ...draftMessage({ channelId: conversationId, text, nonce, me: meRef.current, attachments: files?.localUris ?? null }),
        reply_to_message_id: replyTo ?? null,
        mls: true,
      };
      if (!content) {
        setDrafts((current) => [...current, { ...draft, pending: false, failed: true, failure: "Not sent. A file wasn't encrypted." }]);
        return;
      }
      outgoing.current.set(nonce, content);
      setDrafts((current) => [...current, draft]);
      dispatch(nonce, content);
    },
    [conversationId, dispatch],
  );

  // Files are fetched and decrypted onto disk once each, as sealed DMs do it.
  useEffect(() => {
    if (!conversationId) return;
    for (const row of archived) {
      for (const fileId of row.attachments ?? []) {
        const key = fileKeys.current.get(fileId);
        if (!key || opened.has(fileId) || opening.current.has(fileId)) continue;
        opening.current.add(fileId);
        materialiseSealedAttachment({
          url: attachmentUrl(host, fileId),
          fileId,
          key,
          openFile: (ciphertext, meta) => openAttachment({ ciphertext, conversationId, meta }),
        })
          .then(
            (uri) => sealedAttachmentMeta(fileId, key, uri),
            (e: unknown) => {
              console.warn("[MLS] A file didn't open:", fileId, e);
              return "failed" as const;
            },
          )
          .then((result) => {
            // Dropped if the screen moved to another conversation meanwhile.
            if (!opening.current.delete(fileId)) return;
            setOpened((current) => new Map(current).set(fileId, result));
          });
      }
    }
  }, [host, conversationId, archived, opened]);

  const retry = useCallback(
    (nonce: string) => {
      const content = outgoing.current.get(nonce);
      if (!content) return;
      setDrafts((current) =>
        current.map((m) => (m.nonce === nonce ? { ...m, pending: true, failed: false, failure: undefined } : m)),
      );
      dispatch(nonce, content);
    },
    [dispatch],
  );

  const discard = useCallback((nonce: string) => {
    outgoing.current.delete(nonce);
    setDrafts((current) => current.filter((m) => m.nonce !== nonce));
  }, []);

  const change = useCallback(
    (content: MlsContent) => {
      if (!session || !conversationId || !peer) return;
      session
        .send(conversationId, peer, content)
        .catch((e: unknown) => console.warn(`[MLS] The ${content.type} didn't go:`, e));
    },
    [session, conversationId, peer],
  );

  // A sent draft goes once its archived copy, under the same id, is on screen.
  const rows = useMemo(() => {
    if (!active) return [];
    const archivedIds = new Set(archived.map((m) => m.message_id));
    return [...archived.map((m) => withOpenedFiles(m, opened)), ...drafts.filter((d) => !archivedIds.has(d.nonce ?? ""))];
  }, [active, archived, drafts, opened]);

  useEffect(() => {
    const archivedIds = new Set(archived.map((m) => m.message_id));
    setDrafts((current) => (current.some((d) => archivedIds.has(d.nonce ?? "")) ? current.filter((d) => !archivedIds.has(d.nonce ?? "")) : current));
  }, [archived]);

  return {
    mode: active ? mode : null,
    // Held with no session yet too: version 1 to somebody seen on MLS is what decision 4 forbids.
    waiting: !!conversationId && !!peer && (!session || mode === null),
    rows,
    hasMore: active && hasMore,
    loadOlder: useCallback(() => {
      if (hasMore) setLimit((n) => n + PAGE);
    }, [hasMore]),
    problems: active ? problems : NO_PROBLEMS,
    lostHistory: active && lostHistory,
    send,
    edit: useCallback(
      (id: string, text: string) => {
        const body = text.trim();
        if (body) change({ type: "edit", id, text: body });
      },
      [change],
    ),
    remove: useCallback((id: string) => change({ type: "delete", id }), [change]),
    retry,
    discard,
  };
}
