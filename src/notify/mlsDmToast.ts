import type { Channel } from "../connection/types";
import { announcesMessages } from "./announce";

/** What a live MLS message decides with — just enough of it, not the full driver shape. */
export interface MlsDeliveredMessage {
  conversationId: string;
  senderId: string;
  /** Null when the MLS layer decrypted fine but the content inside didn't decode. */
  content: { type: "message"; text: string } | null;
}

export interface MlsDmToast {
  title: string;
  description: string | undefined;
}

/**
 * Whether a decrypted MLS DM should toast, and what it says. Not looking at the
 * server, muted, or under the notification level: none of it, same as a plain message.
 */
export function mlsDmToast(
  message: MlsDeliveredMessage,
  options: {
    active: boolean;
    host: string;
    serverName: string;
    channel: Pick<Channel, "id" | "defaultNotificationLevel"> | undefined;
    senderName: string | undefined;
    preview: (text: string) => string | undefined;
  },
): MlsDmToast | null {
  if (options.active) return null;
  if (!announcesMessages(options.host, options.channel)) return null;

  if (!message.content) {
    return { title: options.serverName, description: "New message" };
  }
  const text = message.content.text ? options.preview(message.content.text) : undefined;
  return {
    title: options.serverName,
    description: options.senderName ? `${options.senderName}: ${text ?? ""}`.trim() : text,
  };
}
