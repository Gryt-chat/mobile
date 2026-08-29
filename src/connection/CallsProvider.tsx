import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useServerConnection } from "./ConnectionsProvider";
import {
  afterCallMembers,
  afterWithdrawal,
  endedMessage,
  hasExpired,
  isRing,
  type CallMembers,
  type CallWithdrawn,
  type IncomingCall,
} from "./calls";

/**
 * Ringing, on this server.
 *
 * A call is not something the server keeps. It is an SFU room whose id is the
 * conversation id, joined through the same path a voice channel is, so once you
 * are in a call the ordinary voice state is the truth about it and there is
 * nothing here for it. This holds only the moment before: somebody is ringing
 * and nobody has answered.
 *
 * Answering is not an event either. It is joining the room, and the server ends
 * the ring when the join lands — which is why `accept` hands the call back
 * rather than doing anything with it. This provider knows about ringing and
 * deliberately nothing about media.
 *
 * Per-socket, like `DirectMessagesProvider`, because a conversation id means
 * nothing on another server. A server from before calls existed sends none of
 * these events, so nothing ever appears and nothing here needs to know.
 */

export type { IncomingCall };

export interface Calls {
  /** Somebody is ringing you and you have not answered. */
  incoming: IncomingCall | null;
  /** You are ringing and nobody has picked up. */
  outgoing: IncomingCall | null;
  /** Ring everybody else in a conversation. */
  ring: (conversationId: string) => void;
  /** Say no. The server ends it for everybody, which is what a decline means. */
  decline: (conversationId: string) => void;
  /** Give up on one you started. */
  cancel: (conversationId: string) => void;
  /**
   * Take the call. Clears the ring and hands back the conversation so the
   * caller can join its room; the server ends the ring on the join.
   */
  accept: () => IncomingCall | null;
  /**
   * The conversations with a call going on in them.
   *
   * Told to everybody in the conversation rather than only to the people in the
   * call, which is what lets a row say something is happening before you have
   * joined it. Empty on a server that predates calling: no event, no entries,
   * no dot.
   */
  liveCalls: Set<string>;
  /** The last thing that happened worth saying, or null. Cleared by reading it. */
  notice: string | null;
  clearNotice: () => void;
}

const CallsContext = createContext<Calls | null>(null);

export function useCalls(): Calls {
  const calls = useContext(CallsContext);
  if (!calls) throw new Error("useCalls must be used inside a CallsProvider");
  return calls;
}

export function CallsProvider({
  host,
  children,
}: {
  host: string | null;
  children?: ReactNode;
}) {
  const { socket, getAccessToken } = useServerConnection();
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [outgoing, setOutgoing] = useState<IncomingCall | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [liveCalls, setLiveCalls] = useState<Set<string>>(() => new Set());

  /* A ring belongs to the server it came from. Changing server must not leave
   * the last one's card on screen — answering it would ask this server for a
   * room it has never heard of. */
  useEffect(() => {
    setIncoming(null);
    setOutgoing(null);
    setNotice(null);
    setLiveCalls(new Set());
  }, [host]);

  useEffect(() => {
    if (!socket) return;

    const rang = (payload: unknown) => {
      if (isRing(payload)) setIncoming(payload);
    };

    /* Your own other device started this one. Without it a call rung from the
       desktop looks like nothing at all on the phone. */
    const ringing = (payload: unknown) => {
      if (isRing(payload)) setOutgoing(payload);
    };

    const withdrawn = (payload: CallWithdrawn) => {
      setIncoming((prev) => afterWithdrawal(prev, payload));
      setOutgoing((prev) => afterWithdrawal(prev, payload));
      const said = endedMessage(payload);
      if (said) setNotice(said);
    };

    const refused = (payload: { message?: string }) => {
      if (typeof payload?.message === "string") setNotice(payload.message);
    };

    /* Who is in a call, which for somebody outside it is only ever used to say
       that there is one. The in-call view is built from the SFU's streams and
       does not read this. */
    const members = (payload: CallMembers) => {
      setLiveCalls((prev) => afterCallMembers(prev, payload));
    };

    socket.on("call:incoming", rang);
    socket.on("call:ringing", ringing);
    socket.on("call:withdrawn", withdrawn);
    socket.on("call:error", refused);
    socket.on("voice:call:members", members);
    return () => {
      socket.off("call:incoming", rang);
      socket.off("call:ringing", ringing);
      socket.off("call:withdrawn", withdrawn);
      socket.off("call:error", refused);
      socket.off("voice:call:members", members);
    };
  }, [socket]);

  /* The server's own clock, kept here as well. Its withdrawal is the real end;
   * this is what stops a ring sitting on screen for ever when the socket died
   * between the ring and the timeout. */
  useEffect(() => {
    const call = incoming ?? outgoing;
    if (!call) return;
    const remaining = call.expires_at - Date.now();
    if (remaining <= 0) {
      setIncoming((prev) => (hasExpired(prev, Date.now()) ? null : prev));
      setOutgoing((prev) => (hasExpired(prev, Date.now()) ? null : prev));
      return;
    }
    const timer = setTimeout(() => {
      setIncoming((prev) => (hasExpired(prev, Date.now()) ? null : prev));
      setOutgoing((prev) => (hasExpired(prev, Date.now()) ? null : prev));
    }, remaining);
    return () => clearTimeout(timer);
  }, [incoming, outgoing]);

  const emit = useCallback(
    (event: string, conversationId: string) => {
      if (!socket) return;
      getAccessToken().then((accessToken) => {
        if (!accessToken) return;
        socket.emit(event, { accessToken, conversationId });
      });
    },
    [socket, getAccessToken],
  );

  const value = useMemo<Calls>(
    () => ({
      incoming,
      outgoing,
      ring: (conversationId) => emit("call:ring", conversationId),
      decline: (conversationId) => {
        /* Cleared here rather than waiting for the withdrawal, so the card goes
           the moment it is refused. The server's answer arrives either way and
           clearing twice costs nothing. */
        setIncoming((prev) => afterWithdrawal(prev, { conversation_id: conversationId }));
        emit("call:decline", conversationId);
      },
      cancel: (conversationId) => {
        setOutgoing((prev) => afterWithdrawal(prev, { conversation_id: conversationId }));
        emit("call:cancel", conversationId);
      },
      accept: () => {
        const call = incoming;
        setIncoming(null);
        return call;
      },
      liveCalls,
      notice,
      clearNotice: () => setNotice(null),
    }),
    [incoming, outgoing, liveCalls, notice, emit],
  );

  return <CallsContext.Provider value={value}>{children}</CallsContext.Provider>;
}
