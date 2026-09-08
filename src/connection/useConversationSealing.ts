import {
  decideSealing,
  type DmKeyPair,
  openAttachment,
  openForConversation,
  type OpenedMessage,
  sealAttachment,
  type SealDecision,
  type SealedAttachmentKey,
  sealForConversation,
} from "@gryt/crypto";
import { useCallback, useEffect, useMemo, useState } from "react";

import { dmKeyPairFor } from "../identity/dmKeys";
import { useMembers } from "./MembersProvider";
import { dmScopeFor } from "./pins";

/**
 * Whether the conversation on screen can be encrypted, and doing it. The same three
 * `@gryt/crypto` calls the desktop makes (GRYT-729).
 */

export interface ConversationSealing {
  /**
   * Whether the next message will be sealed, and who is stopping it if not. A
   * composer that does not draw this sends in the clear without saying so.
   */
  decision: SealDecision;
  /**
   * Null means send it as text. `attachments` is what `sealFile` handed back, so the
   * order is: encrypt and upload each file, then seal the message.
   */
  seal: (
    plaintext: string,
    attachments?: Record<string, SealedAttachmentKey>,
  ) => Promise<string | null>;
  /**
   * Encrypt one file, or null when this conversation is not being sealed. **A caller
   * treating null as an error stops pictures in channels** (GRYT-761).
   */
  sealFile: (
    bytes: Uint8Array,
    about?: { name?: string; mime?: string; width?: number; height?: number },
  ) => { ciphertext: Uint8Array; meta: SealedAttachmentKey } | null;
  /** Turn a downloaded attachment back into its bytes. Throws if it will not. */
  openFile: (ciphertext: Uint8Array, meta: SealedAttachmentKey) => Uint8Array;
  /**
   * Null means there is no wrapped key for us. Throws when a key is there and does
   * not open. `attachments` comes back here rather than behind a second call.
   */
  open: (sealed: string) => Promise<OpenedMessage | null>;
}

export function useConversationSealing({
  host,
  conversationId,
  myServerUserId,
  members,
}: {
  host: string | null;
  conversationId: string | null;
  myServerUserId?: string | null;
  /**
   * Everybody in the conversation apart from you, or null for a channel. Passed in:
   * the direct-message list is a subscription and the caller holds the participants.
   */
  members: { server_user_id: string }[] | null;
}): ConversationSealing {
  const { keyStates } = useMembers();
  const [keys, setKeys] = useState<DmKeyPair | null>(null);

  useEffect(() => {
    if (!host) {
      setKeys(null);
      return;
    }

    // Cancelled on a host change rather than left to land, so switching servers
    // cannot leave one server's keys in place while another's are derived.
    let live = true;
    void dmScopeFor(host)
      .then((scope) => dmKeyPairFor(scope))
      .then((pair) => {
        if (live) setKeys(pair);
      })
      .catch(() => {
        if (live) setKeys(null);
      });

    return () => {
      live = false;
    };
  }, [host]);

  const decision = useMemo<SealDecision>(() => {
    // A channel, or a conversation this client does not know yet. Neither is
    // sealable and neither is anybody's fault, so `blockedBy` stays empty.
    if (!members) return { kind: "plaintext", blockedBy: [] };

    return decideSealing({
      members: members.map((member) => ({
        memberId: member.server_user_id,
        keyState: keyStates[member.server_user_id],
      })),
      self:
        keys && myServerUserId
          ? { memberId: myServerUserId, publicKey: keys.publicKey }
          : null,
    });
  }, [members, keyStates, keys, myServerUserId]);

  const seal = useCallback(
    async (plaintext: string, attachments?: Record<string, SealedAttachmentKey>) => {
      if (!keys || !conversationId) return null;
      return sealForConversation({
        plaintext,
        conversationId,
        senderKeys: keys,
        decision,
        attachments,
      });
    },
    [keys, conversationId, decision],
  );

  const sealFile = useCallback(
    (
      bytes: Uint8Array,
      about?: { name?: string; mime?: string; width?: number; height?: number },
    ) => {
      // The same condition the text obeys, checked here rather than trusted: a file
      // sealed for a message that goes out plain is an upload nobody opens.
      if (!conversationId || decision.kind !== "seal") return null;

      return sealAttachment({ bytes, conversationId, ...about });
    },
    [conversationId, decision],
  );

  const openFile = useCallback(
    (ciphertext: Uint8Array, meta: SealedAttachmentKey) => {
      if (!conversationId) throw new Error("No conversation to open this against.");
      return openAttachment({ ciphertext, conversationId, meta });
    },
    [conversationId],
  );

  const open = useCallback(
    async (sealed: string) => {
      if (!keys || !conversationId || !myServerUserId) return null;
      return openForConversation({
        sealed,
        conversationId,
        memberId: myServerUserId,
        recipientKeys: keys,
      });
    },
    [keys, conversationId, myServerUserId],
  );

  return { decision, seal, sealFile, openFile, open };
}
