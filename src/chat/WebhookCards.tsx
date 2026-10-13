import { useState } from "react";
import { View } from "react-native";
import { useTheme, WebhookCard } from "@gryt/ui-native";

import type { StoredWebhookCard } from "../connection/types";
import { ImageLightbox } from "./ImageLightbox";
import { MessageMarkdown, openMessageLink } from "./MessageMarkdown";
import { messageCards, toWebhookCardData } from "./cardData";

/** A webhook message's cards, in order. Mentions in them draw but never ping: the server only reads `text`. */
export function WebhookCards({
  cards,
  host,
  mentionable,
  flush,
  width,
}: {
  cards: StoredWebhookCard[] | null | undefined;
  host: string;
  mentionable?: string[];
  /** Inside a bubble: no gap of its own above, and corners that sit concentric in the bubble's. */
  flush?: boolean;
  /** Room the bubble leaves. Without it the card sizes to its text and runs out of the bubble. */
  width?: number;
}) {
  const theme = useTheme();
  const [image, setImage] = useState<string | null>(null);
  const shown = messageCards(cards);
  if (shown.length === 0) return null;

  return (
    <View style={{ gap: theme.space(2), paddingTop: flush ? 0 : theme.space(2), width }}>
      {shown.map((card, index) => (
        <WebhookCard
          key={index}
          card={toWebhookCardData(card, host)}
          renderMarkdown={(text, where) => (
            <MessageMarkdown
              text={text}
              mentionable={mentionable}
              style={
                where === "field"
                  ? { color: theme.color.text, fontSize: 12, lineHeight: 17 }
                  : { color: theme.color.text, fontSize: 14, lineHeight: 20 }
              }
            />
          )}
          onOpenUrl={openMessageLink}
          onPressImage={setImage}
          style={flush ? { borderRadius: theme.radius.md } : undefined}
        />
      ))}
      <ImageLightbox images={image ? [{ uri: image }] : []} index={image ? 0 : null} onClose={() => setImage(null)} />
    </View>
  );
}
