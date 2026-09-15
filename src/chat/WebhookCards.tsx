import { useState } from "react";
import { View } from "react-native";
import { useTheme, WebhookCard } from "@gryt/ui-native";

import type { StoredWebhookCard } from "../connection/types";
import { Lightbox } from "./Attachments";
import { MessageMarkdown, openMessageLink } from "./MessageMarkdown";
import { messageCards, toWebhookCardData } from "./cardData";

/** A webhook message's cards, in order. Mentions in them draw but never ping: the server only reads `text`. */
export function WebhookCards({
  cards,
  host,
  mentionable,
}: {
  cards: StoredWebhookCard[] | null | undefined;
  host: string;
  mentionable?: string[];
}) {
  const theme = useTheme();
  const [image, setImage] = useState<string | null>(null);
  const shown = messageCards(cards);
  if (shown.length === 0) return null;

  return (
    <View style={{ gap: theme.space(2), paddingTop: theme.space(2) }}>
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
        />
      ))}
      <Lightbox uri={image} onClose={() => setImage(null)} />
    </View>
  );
}
