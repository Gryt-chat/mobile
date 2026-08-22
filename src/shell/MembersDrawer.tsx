import { Pressable, View } from "react-native";
import { Text } from "../ui/Text";
import { Drawer, useTheme } from "@gryt/ui-native";
import { XIcon } from "phosphor-react-native/src/icons/X";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { useMembers } from "../connection/MembersProvider";
import { aroundCount, presenceGroups } from "../connection/presence";
import type { Channel, Member, UserStatus } from "../connection/types";

/**
 * Everyone on the server, from the right.
 *
 * Sorted by how present somebody is rather than by rank, because the question
 * this answers is "who is about" — an owner who has been offline a week is not
 * the answer to it. Role still shows on the row, which is the other thing
 * anybody opens this for.
 *
 * A `Drawer` rather than a `Sheet`, and the difference matters for more than
 * the direction it comes from: the drawer renders through React Native's own
 * `Modal`, so context crosses it and `useMembers` can be read *inside* here.
 * `Sheet` goes through `@gorhom/portal`, which is why the voice sheet has to
 * gather every value it needs in its own body before rendering one.
 *
 * **Presence only.** Muted and deafened arrive on the same payload and are
 * deliberately not drawn — they belong to the voice sheet, which is where the
 * app subscribes to them. A drawer that redrew every time somebody across the
 * server tapped mute would be paying for the thing this design is avoiding.
 */
export function MembersDrawer({
  open,
  onOpenChange,
  channels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** For naming the room somebody is in. */
  channels: Channel[];
}) {
  const theme = useTheme();
  const { all } = useMembers();

  const groups = presenceGroups(all);
  const { present, total } = aroundCount(all);
  const roomName = new Map(channels.map((c) => [c.id, c.name]));

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Popup side="right" size={0.84}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space(2),
              paddingHorizontal: theme.space(4),
              paddingTop: theme.space(2),
              paddingBottom: theme.space(3),
              borderBottomWidth: 1,
              borderColor: theme.color.border,
            }}
          >
            <Text
              style={{ color: theme.color.text, fontSize: 19, fontWeight: "700", flex: 1 }}
            >
              Who&apos;s about
            </Text>
            <Text style={{ color: theme.color.muted, fontSize: 13 }}>
              {present} / {total}
            </Text>
            <Pressable
              onPress={() => onOpenChange(false)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <XIcon size={20} color={theme.color.muted} weight="bold" />
            </Pressable>
          </View>

          {/* `Drawer.ScrollView`, not React Native's — the drawer's swipe and a
              scroll view's native recogniser both want the touch, and the two
              have to be introduced by reference. */}
          <Drawer.ScrollView
            contentContainerStyle={{ paddingBottom: theme.space(6) }}
          >
            {all.length === 0 ? (
              <Text
                style={{
                  color: theme.color.muted,
                  fontSize: 15,
                  textAlign: "center",
                  padding: theme.space(8),
                }}
              >
                Waiting for the member list.
              </Text>
            ) : null}

            {groups.map((group) => (
              <View key={group.key}>
                <GroupHeading label={group.label} count={group.members.length} />
                {group.members.map((member) => (
                  <MemberRow
                    key={member.serverUserId}
                    member={member}
                    faded={group.key === "offline"}
                    /* Named where they are, but only in the group where that is
                       what you are reading the row for. */
                    room={
                      group.key === "voice"
                        ? (roomName.get(member.voiceChannelId ?? "") ?? null)
                        : null
                    }
                  />
                ))}
              </View>
            ))}
          </Drawer.ScrollView>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function GroupHeading({ label, count }: { label: string; count: number }) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "baseline",
        gap: theme.space(2),
        paddingHorizontal: theme.space(4),
        paddingTop: theme.space(4),
        paddingBottom: theme.space(1),
      }}
    >
      <Text
        style={{
          color: theme.color.muted,
          fontSize: 11.5,
          fontWeight: "700",
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <Text style={{ color: theme.color.muted, fontSize: 11.5 }}>{count}</Text>
    </View>
  );
}

function MemberRow({
  member,
  room,
  faded,
}: {
  member: Member;
  /** The voice channel they are in, when that is what the group is about. */
  room: string | null;
  faded: boolean;
}) {
  const theme = useTheme();
  const { avatarUrlFor } = useMembers();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingHorizontal: theme.space(4),
        paddingVertical: theme.space(1),
        opacity: faded ? 0.55 : 1,
      }}
    >
      <View>
        <PersonAvatar
          name={member.nickname}
          source={avatarUrlFor(member)}
          size={32}
        />
        <StatusDot member={member} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ color: theme.color.text, fontSize: 15, fontWeight: "500" }}
        >
          {member.nickname}
        </Text>
        {room ? (
          <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 11.5 }}>
            {room}
          </Text>
        ) : null}
      </View>

      <RoleChip role={member.role} />
    </View>
  );
}

/**
 * The dot on the corner of a face.
 *
 * Read off `voiceChannelId` first, for the same reason `presenceGroups` is: the
 * server derives `status` from `hasJoinedChannel` and sends the channel
 * separately, so a dot taken from `status` could disagree with the group the
 * row is sitting in.
 */
function StatusDot({ member }: { member: Member }) {
  const theme = useTheme();

  const colour = ((): string => {
    if (member.voiceChannelId) return theme.color.accent;
    const status: UserStatus = member.status ?? "offline";
    if (status === "afk") return theme.color.warning;
    if (status === "offline") return theme.color.border;
    return theme.color.success;
  })();

  return (
    <View
      style={{
        position: "absolute",
        right: -1,
        bottom: -1,
        width: 11,
        height: 11,
        borderRadius: 999,
        backgroundColor: colour,
        borderWidth: 2,
        borderColor: theme.color.surface,
      }}
    />
  );
}

/** Owner, admin and mod say something. "Member" is everybody, so it says nothing. */
function RoleChip({ role }: { role?: string }) {
  const theme = useTheme();

  if (!role || role === "member") return null;

  const tone = role === "owner" ? theme.color.accent : theme.color.secondary;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: tone,
        borderRadius: 999,
        paddingHorizontal: theme.space(2),
        paddingVertical: 1,
      }}
    >
      <Text
        style={{
          color: tone,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        {role}
      </Text>
    </View>
  );
}
