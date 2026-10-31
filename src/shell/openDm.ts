import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { useToast } from "@gryt/ui-native";

import { useServerConnection } from "../connection/ConnectionsProvider";
import { useDirectMessages } from "../connection/DirectMessagesProvider";
import { canOnServer } from "../connection/permissions";

/**
 * Whether this server would take a new conversation from this account.
 * **`canOnServer` answers true for a permission a server has never heard of.**
 */
export function useCanStartDm(): boolean {
  const { state } = useServerConnection();
  const { dmsAllowed } = useDirectMessages();
  return dmsAllowed && canOnServer(
    state.status === "ready" ? state.details : undefined,
    "send_direct_messages",
  );
}

/** Opens the conversation with someone, starting it first when there isn't one. On Messages (GRYT-1775). */
export function useOpenDm(): (serverUserId: string) => void {
  const { conversations, withMember, open, error, errorAt } = useDirectMessages();
  const toast = useToast();

  /**
   * Who was asked for, until their conversation turns up: `dm:open` has no reply
   * of its own. Deriving the id here would mean owning a rule the server owns.
   */
  const pending = useRef<string | null>(null);

  useEffect(() => {
    const target = pending.current;
    if (!target) return;
    const match = conversations.find((c) => c.other.server_user_id === target);
    if (!match) return;
    pending.current = null;
    router.push({ pathname: "/messages/conversation/[id]", params: { id: match.conversation_id } });
  }, [conversations]);

  useEffect(() => {
    if (!pending.current || !errorAt) return;
    pending.current = null;
    toast.show({ title: error ?? "Something went wrong" });
  }, [errorAt, error, toast]);

  return (serverUserId) => {
    const existing = withMember(serverUserId);
    if (existing) {
      router.push({ pathname: "/messages/conversation/[id]", params: { id: existing.conversation_id } });
      return;
    }
    pending.current = serverUserId;
    open(serverUserId);
  };
}
