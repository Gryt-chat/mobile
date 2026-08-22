import { Text, View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { useMembers } from "../connection/MembersProvider";
import type { Member } from "../connection/types";

/**
 * A row of overlapping faces, and a count for whoever did not fit.
 *
 * The overlap is what makes a group of people read as one thing at a glance,
 * which is the whole job here — a card is 168pt wide and four separate avatars
 * in a row would be four things to count.
 *
 * `ground` is the colour behind the stack rather than a guess, because the ring
 * that separates one face from the next is drawn in it. On `surface` it has to
 * be surface; on the call panel it has to be `surfaceRaised`. Getting it wrong
 * leaves a hairline of the wrong colour around every face, which is the sort of
 * thing that reads as blurry rather than as wrong.
 */
export function Faces({
  members,
  size = 32,
  limit = 5,
  ground,
}: {
  members: Member[];
  size?: number;
  /** How many faces before the rest become a number. */
  limit?: number;
  /** The colour behind the stack, for the ring between faces. */
  ground: string;
}) {
  const theme = useTheme();
  const { avatarUrlFor } = useMembers();

  const shown = members.slice(0, limit);
  const rest = members.length - shown.length;
  const ring = 2;
  const overlap = Math.round(size * 0.28);

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {shown.map((member, index) => (
        <View
          key={member.serverUserId}
          style={{
            marginLeft: index === 0 ? 0 : -overlap,
            borderRadius: 999,
            borderWidth: ring,
            borderColor: ground,
          }}
        >
          <PersonAvatar
            name={member.nickname}
            source={avatarUrlFor(member)}
            size={size}
          />
        </View>
      ))}

      {rest > 0 ? (
        <View
          style={{
            marginLeft: -overlap,
            width: size + ring * 2,
            height: size + ring * 2,
            borderRadius: 999,
            borderWidth: ring,
            borderColor: ground,
            backgroundColor: theme.color.surfaceRaised,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: theme.color.text,
              fontSize: Math.max(10, Math.round(size * 0.34)),
              fontWeight: "700",
            }}
          >
            +{rest}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
