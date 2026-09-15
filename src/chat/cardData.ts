import type { WebhookCardData } from "@gryt/ui-native";

import type { StoredWebhookCard } from "../connection/types";
import { attachmentUrl } from "./files";

/** A stored card as the component wants it, each file id turned into its upload URL on `host`. */
export function toWebhookCardData(card: StoredWebhookCard, host: string): WebhookCardData {
  const url = (fileId: string | undefined) => (fileId && host ? attachmentUrl(host, fileId) : undefined);

  return {
    title: card.title,
    url: card.url,
    description: card.description,
    color: card.color,
    author: card.author
      ? { name: card.author.name, url: card.author.url, iconUrl: url(card.author.icon_file_id) }
      : undefined,
    fields: card.fields?.map((field) => ({ name: field.name, value: field.value, inline: field.inline })),
    imageUrl: url(card.image_file_id),
    thumbnailUrl: url(card.thumbnail_file_id),
    footer: card.footer
      ? { text: card.footer.text, iconUrl: url(card.footer.icon_file_id) }
      : undefined,
    timestamp: card.timestamp,
  };
}

/** The cards worth drawing: none on a message without them, and never more than ten. */
export function messageCards(cards: StoredWebhookCard[] | null | undefined): StoredWebhookCard[] {
  return Array.isArray(cards) ? cards.slice(0, 10) : [];
}
