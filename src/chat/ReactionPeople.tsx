import { useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Drawer, Text, useTheme } from "@gryt/ui-native";

import { PersonAvatar } from "../avatar/PersonAvatar";
import type { ReactionSummary } from "./messageAbilities";

type Person = { name: string; avatar: string | null };

/**
 * Who reacted to a message, on a hold of one of its chips (GRYT-1840). One tab per
 * reaction, opened on the one held. A `Drawer`, like `MessageActions`, for the same reason.
 */
export function ReactionPeople({
  reactions,
  shown,
  onClose,
  personOf,
}: {
  reactions: ReactionSummary[];
  /** The reaction held, or null while it's closed. */
  shown: string | null;
  onClose: () => void;
  personOf: (userId: string) => Person;
}) {
  const { height } = useWindowDimensions();

  return (
    <Drawer.Root open={shown !== null && reactions.length > 0} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Popup side="bottom" size={Math.min(0.7, 360 / height)}>
          {/* Its own component: the portal holds on to what it was given, so state up here never redrew. */}
          {shown !== null ? <People key={shown} reactions={reactions} start={shown} personOf={personOf} /> : null}
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function People({ reactions, start, personOf }: { reactions: ReactionSummary[]; start: string; personOf: (userId: string) => Person }) {
  const theme = useTheme();
  const [tab, setTab] = useState(start);
  // The last one taken away leaves nothing to show, so the first one stands in.
  const reaction = reactions.find((r) => r.src === tab) ?? reactions[0];
  if (!reaction) return null;
  const people = reaction.users.map(personOf);
  const unnamed = reaction.count - people.length;

  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space(1.5), paddingHorizontal: theme.space(3), paddingVertical: theme.space(2) }}>
        {reactions.map((r) => {
          const on = r.src === reaction.src;
          return (
            <Pressable
              key={r.src}
              onPress={() => setTab(r.src)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${r.src}, ${r.count}`}
              style={{
                flexDirection: "row", alignItems: "center", gap: theme.space(1.5),
                paddingHorizontal: theme.space(2.5), paddingVertical: theme.space(1), borderRadius: 999,
                borderWidth: 1, borderColor: on ? theme.color.accent : theme.color.border,
                backgroundColor: on ? theme.alpha.accent[2] : theme.color.surfaceRaised,
              }}
            >
              <Text style={{ fontSize: 16 }}>{r.src}</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: on ? theme.color.accent : theme.color.muted }}>{r.count}</Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: theme.space(4), paddingBottom: theme.space(8) }}>
        {people.map((person, i) => (
          <View key={reaction.users[i]} style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3), paddingVertical: theme.space(2) }}>
            <PersonAvatar name={person.name} source={person.avatar} size={32} variant="bare" />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: theme.color.text }}>{person.name}</Text>
          </View>
        ))}
        {unnamed > 0 ? (
          <Text style={{ fontSize: 14, color: theme.color.muted, paddingVertical: theme.space(2.5) }}>
            {people.length ? `and ${unnamed} more` : `${unnamed} ${unnamed === 1 ? "person" : "people"}`}
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}
