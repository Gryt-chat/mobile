import { useMemo } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";

import { useCustomEmojis } from "./CustomEmojiProvider";
import { rank, type Query } from "./autocomplete";
import { standardEmojiNames, unicodeFor } from "./emoji";

/**
 * What is on offer while a `@` or a `:` is being typed.
 *
 * One horizontal strip above the composer, for both triggers. The desktop has a
 * component each, and it should: on a keyboard they are lists you walk with
 * arrows and commit with tab. On a phone there are no arrow keys, the commit is
 * a tap, and there is one row of space above the keyboard.
 *
 * **Horizontal rather than a list above the field.** The keyboard already owns
 * the bottom half of the screen, and a list growing upwards from the composer
 * covers the message being replied to. A strip is one row, always the same
 * height, and never moves anything.
 */
export function Suggestions({
  query,
  people,
  onPick,
}: {
  /** What the caret is inside, or null to draw nothing. */
  query: Query | null;
  /** Nicknames on this server. */
  people: string[];
  onPick: (choice: string) => void;
}) {
  const theme = useTheme();
  const custom = useCustomEmojis();

  const choices = useMemo(() => {
    if (!query) return [];
    if (query.trigger === "@") return rank(people, query.term);

    /* This server's own emoji first, then the standard ones. A server uploads
     * emoji because it wants them used, and they are the ones nobody can guess
     * the name of — the standard table is the same everywhere and is what
     * somebody already half-knows.
     *
     * Only searched once there is something to search on. Every standard name
     * is several thousand entries and an empty term would rank all of them to
     * offer the first eight alphabetically, which is not a useful list. */
    if (!query.term) return rank([...custom.keys()], "");
    return rank([...custom.keys(), ...standardEmojiNames()], query.term);
  }, [query, people, custom]);

  if (!query || choices.length === 0) return null;

  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: theme.color.border,
      }}
    >
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: theme.space(2),
          paddingHorizontal: theme.space(3),
          paddingVertical: theme.space(2),
        }}
      >
        {choices.map((choice) => (
          <Pressable
            key={choice}
            onPress={() => onPick(choice)}
            accessibilityRole="button"
            accessibilityLabel={query.trigger === "@" ? `Mention ${choice}` : `Insert ${choice}`}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space(1.5),
              paddingHorizontal: theme.space(3),
              paddingVertical: theme.space(1.5),
              borderRadius: theme.radius.full,
              backgroundColor: pressed ? theme.color.surfaceHover : theme.color.bg,
              borderWidth: 1,
              borderColor: theme.color.border,
            })}
          >
            {query.trigger === ":" ? <Preview name={choice} url={custom.get(choice)} /> : null}
            <Text style={{ color: theme.color.text, fontSize: 14 }}>
              {query.trigger === "@" ? choice : `:${choice}:`}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function Preview({ name, url }: { name: string; url: string | undefined }) {
  if (url) {
    return (
      <Image source={{ uri: url }} style={{ width: 18, height: 18 }} resizeMode="contain" />
    );
  }
  const character = unicodeFor(name);
  return character ? <Text style={{ fontSize: 16 }}>{character}</Text> : null;
}
