import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { fakeConversations, fakeDmsOn } from "../dev/fakeDms";
import { useShell } from "../shell/ShellContext";
import { useConnections } from "./ConnectionsProvider";
import { promoteConversation, type DirectConversation } from "./directMessages";
import type { Member } from "./types";

/**
 * Every server's direct messages, for the Messages tab (GRYT-1747). One row per
 * conversation, never merged by person: two servers can't tell you they're one.
 */

export interface ConversationEntry {
  host: string;
  conversation: DirectConversation;
}

const AllConversationsContext = createContext<ConversationEntry[]>([]);
const AllMembersContext = createContext<Record<string, Member[]>>({});

/** Every server's member list, by host, for New message on the Messages tab (P5). */
export function useAllMembers(): Record<string, Member[]> {
  return useContext(AllMembersContext);
}

export function useAllConversations(): ConversationEntry[] {
  return useContext(AllConversationsContext);
}

/** When something last happened in it: the last message, else when it was made. */
function lastActivity(c: DirectConversation): number {
  return Date.parse(c.last_message_at ?? c.created_at) || 0;
}

/** One server's list, kept current off its own socket. Draws nothing. */
function HostConversations({
  host,
  onChange,
  onMembers,
}: {
  host: string;
  onChange: (host: string, list: DirectConversation[] | ((prev: DirectConversation[]) => DirectConversation[])) => void;
  onMembers: (host: string, list: Member[]) => void;
}) {
  const connection = useConnections().byHost[host];
  const socket = connection?.socket ?? null;
  const online = connection?.online ?? false;
  const getAccessToken = connection?.getAccessToken;

  useEffect(() => {
    if (!socket) return;
    const listed = (payload: { items?: DirectConversation[] }) => {
      if (Array.isArray(payload?.items)) onChange(host, payload.items);
    };
    const opened = (conversation: DirectConversation) => {
      if (conversation?.conversation_id) onChange(host, (prev) => promoteConversation(prev, conversation));
    };
    const left = (payload: { conversation_id?: string }) => {
      if (payload?.conversation_id) onChange(host, (prev) => prev.filter((c) => c.conversation_id !== payload.conversation_id));
    };
    const members = (list: Member[]) => {
      if (Array.isArray(list)) onMembers(host, list);
    };
    socket.on("dm:list", listed);
    socket.on("dm:opened", opened);
    socket.on("dm:left", left);
    socket.on("members:list", members);
    return () => {
      socket.off("dm:list", listed);
      socket.off("dm:opened", opened);
      socket.off("dm:left", left);
      socket.off("members:list", members);
    };
  }, [socket, host, onChange, onMembers]);

  // Asked once the socket is verified, as the active server's provider does.
  useEffect(() => {
    if (!socket || !online || !getAccessToken) return;
    let cancelled = false;
    void getAccessToken().then((accessToken) => {
      if (!cancelled && accessToken) socket.emit("dm:list", { accessToken });
      if (!cancelled) socket.emit("members:fetch");
    });
    return () => {
      cancelled = true;
    };
  }, [socket, online, getAccessToken]);

  return null;
}

export function AllConversationsProvider({ children }: { children?: ReactNode }) {
  const { byHost } = useConnections();
  const activeHost = useShell().server?.host;
  const [lists, setLists] = useState<Record<string, DirectConversation[]>>({});
  const [members, setMembers] = useState<Record<string, Member[]>>({});
  const [onMembers] = useState(() => (host: string, list: Member[]) => setMembers((all) => ({ ...all, [host]: list })));

  // Stable, so each host's listeners aren't torn down on every list that arrives.
  const [onChange] = useState(
    () =>
      (host: string, next: DirectConversation[] | ((prev: DirectConversation[]) => DirectConversation[])) =>
        setLists((all) => ({ ...all, [host]: typeof next === "function" ? next(all[host] ?? []) : next })),
  );

  const hosts = Object.keys(byHost);
  const entries = useMemo(() => {
    const out: ConversationEntry[] = [];
    for (const host of hosts) for (const conversation of lists[host] ?? []) out.push({ host, conversation });
    return out.sort((a, b) => lastActivity(b.conversation) - lastActivity(a.conversation));
    // `hosts` is a fresh array each render; the joined string is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists, hosts.join("\n")]);
  const value = fakeDmsOn && activeHost ? fakeConversations(activeHost) : entries;

  return (
    <AllConversationsContext.Provider value={value}>
      <AllMembersContext.Provider value={members}>
        {hosts.map((host) => (
          <HostConversations key={host} host={host} onChange={onChange} onMembers={onMembers} />
        ))}
        {children}
      </AllMembersContext.Provider>
    </AllConversationsContext.Provider>
  );
}
