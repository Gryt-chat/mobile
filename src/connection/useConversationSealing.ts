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
 * Whether the conversation on screen can be encrypted, and doing it (GRYT-729).
 *
 * The same hook the desktop client has, calling the same three functions in
 * `@gryt/crypto` with the same arguments. Everything with a rule in it is in
 * `conversation-encryption` there; this is the part that has to be a hook
 * because the inputs are React state.
 */

export interface ConversationSealing {
  /**
   * Whether the next message will be sealed, and who is stopping it if not.
   *
   * A composer that does not draw this is back to sending in the clear without
   * saying so, which is the failure the design exists to avoid.
   */
  decision: SealDecision;
  /**
   * Null means send it as text.
   *
   * `attachments` is what `sealFile` handed back, keyed by the id the server
   * assigned — so the two happen in that order: encrypt and upload each file,
   * then seal the message that carries their keys.
   */
  seal: (
    plaintext: string,
    attachments?: Record<string, SealedAttachmentKey>,
  ) => Promise<string | null>;
  /**
   * Encrypt one file, or null when this conversation is not being sealed
   * (GRYT-761).
   *
   * Null is the ordinary answer for a channel and for a conversation somebody
   * in it is holding up, and it means upload the file as it is. A caller that
   * treats null as an error stops people sending pictures in a channel.
   */
  sealFile: (
    bytes: Uint8Array,
    about?: { name?: string; mime?: string; width?: number; height?: number },
  ) => { ciphertext: Uint8Array; meta: SealedAttachmentKey } | null;
  /** Turn a downloaded attachment back into its bytes. Throws if it will not. */
  openFile: (ciphertext: Uint8Array, meta: SealedAttachmentKey) => Uint8Array;
  /**
   * Null means there is no wrapped key for us — somebody who joined after it
   * was sent. Throws when a key is there and does not open, which is tampering
   * or the wrong conversation rather than an ordinary absence.
   *
   * `attachments` is the file keys the message carried, and is empty for the
   * messages that have none. It comes back rather than sitting behind a second
   * call, because a caller that forgets to make that call draws a conversation
   * where files silently do not appear.
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
   * Everybody in the conversation apart from you, or null for a channel.
   *
   * Passed in rather than looked up: the direct-message list is a subscription
   * and the caller already holds the participants.
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
    // quickly cannot leave one server's keys in place while another's are being
    // derived.
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
    // A channel, or a conversation this client does not know about yet. Neither
    // is sealable and neither is anybody's fault, so `blockedBy` stays empty and
    // a composer draws nothing rather than naming a member.
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
      // The same condition the text obeys, checked here rather than trusted
      // from the caller: a file encrypted for a conversation whose message then
      // goes out as plaintext is an upload nobody can ever open, sitting in the
      // operator's storage forever.
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
