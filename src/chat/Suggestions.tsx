import { useMemo } from "react";
import { Image, Pressable, View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";

import { PersonAvatar } from "../avatar/PersonAvatar";
import type { Member } from "../connection/types";
import { useCustomEmojis } from "./CustomEmojiProvider";
import { rank, type Query } from "./autocomplete";
import { standardEmojiNames, unicodeFor } from "./emoji";

function suggestionText(trigger: string, choice: string): string {
  if (trigger === "@") return choice;
  return trigger === "#" ? `#${choice}` : `:${choice}:`;
}

/** What is on offer while a `@`, `#` or `:` is being typed: a card of four rows above the field (C13). */
export function Suggestions({
  query,
  people,
  channels = [],
  members: people_,
  avatarFor,
  onPick,
}: {
  /** What the caret is inside, or null to draw nothing. */
  query: Query | null;
  /** Nicknames on this server, and @everyone, @here and roles where they may be pinged. */
  people: string[];
  /** Channel names `#` offers: only ones this member can see. */
  channels?: string[];
  /** The members behind `people`, for their faces. Without it a row has an @ instead. */
  members?: Member[];
  avatarFor?: (member: Member) => string | null;
  onPick: (choice: string) => void;
}) {
  const theme = useTheme();
  const custom = useCustomEmojis();
  const members = useMemo(() => new Map((people_ ?? []).map((m) => [m.nickname, m])), [people_]);

  const choices = useMemo(() => {
    if (!query) return [];
    if (query.trigger === "@") return rank(people, query.term);
    if (query.trigger === "#") return rank(channels, query.term);

    /* This server's own emoji first: they are the ones nobody can guess the name of.
     * Only searched once there is a term, or several thousand entries get ranked. */
    if (!query.term) return rank([...custom.keys()], "");
    return rank([...custom.keys(), ...standardEmojiNames()], query.term);
  }, [query, people, channels, custom]);

  if (!query || choices.length === 0) return null;

  return (
    <View
      style={{
        borderRadius: 18,
        overflow: "hidden",
        backgroundColor: theme.color.surfaceRaised,
        borderWidth: 1,
        borderColor: theme.color.border,
      }}
    >
      {choices.slice(0, 4).map((choice, index) => (
        <Pressable
          key={choice}
          onPress={() => onPick(choice)}
          accessibilityRole="button"
          accessibilityLabel={query.trigger === ":" ? `Insert ${choice}` : `Mention ${query.trigger}${choice}`}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: theme.space(3),
            minHeight: 48,
            paddingHorizontal: theme.space(3.5),
            backgroundColor: pressed || index === 0 ? theme.color.surfaceHover : "transparent",
          })}
        >
          <Leading trigger={query.trigger} choice={choice} url={custom.get(choice)} member={members.get(choice)} avatarFor={avatarFor} />
          <Text numberOfLines={1} style={{ flex: 1, color: theme.color.text, fontSize: 15, fontWeight: "500" }}>
            {suggestionText(query.trigger, choice)}
          </Text>
          <Text style={{ color: theme.color.muted, fontSize: 13 }}>{detailOf(query.trigger, choice, custom.has(choice), members)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** What sits on the right of a row: a person's role, "Role", "Everyone", or "This server" for its emoji. */
function detailOf(trigger: string, choice: string, custom: boolean, members: Map<string, Member>): string {
  if (trigger === ":") return custom ? "This server" : "";
  if (trigger === "#") return "";
  if (choice === "everyone" || choice === "here") return "Everyone";
  return members.has(choice) ? "" : "Role";
}

function Leading({
  trigger,
  choice,
  url,
  member,
  avatarFor,
}: {
  trigger: string;
  choice: string;
  url: string | undefined;
  member?: Member;
  avatarFor?: (member: Member) => string | null;
}) {
  const theme = useTheme();
  if (trigger === ":") return <View style={{ width: 32, alignItems: "center" }}><Preview name={choice} url={url} /></View>;
  if (trigger === "@" && member) return <PersonAvatar name={member.nickname} source={avatarFor?.(member) ?? null} size={32} />;
  return (
    <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface }}>
      <Text style={{ color: theme.color.muted, fontSize: 15, fontWeight: "700" }}>{trigger}</Text>
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
