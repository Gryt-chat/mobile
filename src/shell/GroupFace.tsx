import { View } from "react-native";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { avatarSource } from "../chat/files";
import type { DirectConversation } from "../connection/directMessages";

/**
 * A group's picture, or up to four of its faces. Rounded rather than round, with the
 * corners a server icon has at this size, so a group never reads as a person.
 */
export function GroupFace({
  host,
  conversation,
  size = 44,
  round = false,
}: {
  host: string;
  conversation: Pick<DirectConversation, "icon_file_id" | "members">;
  size?: number;
  /** Filling a circle, as on the floating call button. */
  round?: boolean;
}) {
  const radius = round ? size / 2 : Math.round(size * 0.375);
  if (conversation.icon_file_id) {
    return (
      <View style={{ width: size, height: size, borderRadius: radius, overflow: "hidden" }}>
        <View style={{ margin: -size * 0.21 }}>
          <PersonAvatar name={null} source={avatarSource(host, conversation.icon_file_id)} size={Math.ceil(size * 1.42)} variant="bare" />
        </View>
      </View>
    );
  }
  const people = conversation.members.slice(0, 4);
  const cell = size / 2;
  return (
    <View
      accessibilityLabel={`Group: ${people.map((p) => p.nickname).join(", ")}`}
      style={{ width: size, height: size, borderRadius: radius, overflow: "hidden", flexDirection: "row", flexWrap: "wrap" }}
    >
      {people.map((p, i) => {
        // Three faces: two on top, one across the bottom. Two: side by side, full height.
        const wide = (people.length === 3 && i === 2) || people.length === 1;
        const tall = people.length <= 2;
        const w = wide ? size : cell;
        const h = tall ? size : cell;
        return (
          <View key={p.server_user_id} style={{ width: w, height: h, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
            <PersonAvatar
              name={p.nickname}
              source={p.avatar_file_id ? avatarSource(host, p.avatar_file_id) : null}
              /* PersonAvatar draws a circle, so it's drawn big enough that the circle covers the cell. */
              size={Math.ceil(Math.max(w, h) * 1.42)}
              variant="bare"
            />
          </View>
        );
      })}
    </View>
  );
}
