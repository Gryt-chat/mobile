import { Pressable, View } from "react-native";
import { Drawer, Text, useTheme } from "@gryt/ui-native";
import { XIcon } from "phosphor-react-native/src/icons/X";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { useMembers } from "../connection/MembersProvider";
import { useBlocks } from "../connection/BlocksProvider";
import { useActionSheet, useConfirm } from "../ui/actionSheet";
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
  onMessage,
  me,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** For naming the room somebody is in. */
  channels: Channel[];
  /**
   * Start a direct message with somebody.
   *
   * Tapping the row, because until now a row did nothing at all — there was no
   * menu to add an item to, and a drawer that answers "who is about" leading to
   * "say something to them" is the thing anybody would try first.
   *
   * Absent on a server too old to have direct messages, and the row goes back
   * to being inert rather than offering something that would be refused.
   */
  onMessage?: (member: Member) => void;
  /** Your own id, so the row for you stays inert. */
  me?: string | null;
}) {
  const theme = useTheme();
  const { all } = useMembers();
  const { isBlocked, block, unblock } = useBlocks();
  const sheet = useActionSheet();
  const confirm = useConfirm();

  /**
   * The long press on a member row.
   *
   * A sheet rather than a second tap target on the row: the row already opens a
   * conversation, and blocking is not something to put a thumb's width from
   * that.
   *
   * The confirmation is about the consequence rather than the write. Blocking
   * changes what you see from then on, silently and server-side, and somebody
   * who has just been sent something upsetting should be told what it will do
   * before it does it. Unblocking asks nothing: it only ever gives back.
   */
  const held = async (member: Member) => {
    const name = member.nickname ?? "them";
    const already = isBlocked(member.serverUserId);

    if (already) {
      const index = await sheet({
        title: name,
        options: [`Unblock ${name}`, "Cancel"],
        cancelButtonIndex: 1,
      });
      if (index === 0) await unblock(member.serverUserId);
      return;
    }

    const index = await sheet({
      title: name,
      options: [`Block ${name}`, "Cancel"],
      destructiveButtonIndex: 0,
      cancelButtonIndex: 1,
    });
    if (index !== 0) return;

    const sure = await confirm({
      title: `Block ${name}?`,
      message:
        "You will stop seeing what they write here, and neither of you can start a conversation with the other. They are not told.",
      confirm: "Block",
    });
    if (sure) await block(member.serverUserId);
  };

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
                    onMessage={
                      onMessage && member.serverUserId !== me
                        ? () => onMessage(member)
                        : undefined
                    }
                    /* Not on your own row. Blocking yourself is refused by the
                       server, so offering it would be a menu that fails. */
                    onHold={member.serverUserId !== me ? () => void held(member) : undefined}
                    blocked={isBlocked(member.serverUserId)}
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

/**
 * A group's name, and how many are in it.
 *
 * **The padding and the margin that cancels it are a workaround, not a style.**
 * On Android the first `Text` in a row is laid out a few dp narrower than the
 * text it holds when anything above it has horizontal padding, and the last
 * glyph is clipped: "AROUND" drew as "AROUN" and "OFFLINE" as "OFFLIN", on a
 * phone and on a tablet, in the build that is on Play now. The padding gives
 * the glyph somewhere to land and the negative margin takes the space back, so
 * the count sits exactly where it did.
 *
 * Measured rather than reasoned about, by drawing the same label several ways
 * on one screen. Neither the letter spacing nor the uppercasing nor
 * `flexShrink` is the cause: identical copies of the same `Text` later in the
 * same row all drew in full, and only the first was ever short. A row with no
 * padding above it anywhere is fine, which is why the compact message header
 * has never shown this. Moving the padding to a wrapper does not help — an
 * ancestor is enough.
 */
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
          paddingRight: 4,
          marginRight: -4,
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
  onMessage,
  onHold,
  blocked,
}: {
  member: Member;
  /** The voice channel they are in, when that is what the group is about. */
  room: string | null;
  faded: boolean;
  onMessage?: () => void;
  /** Block, or unblock. Absent on your own row. */
  onHold?: () => void;
  blocked: boolean;
}) {
  const theme = useTheme();
  const { avatarUrlFor } = useMembers();

  /* A `Pressable` only when there is something to press. One that responds to a
     tap by doing nothing reads as broken, which is the same reasoning the
     message rows in `ChannelScreen` already follow. */
  const Row = onMessage || onHold ? Pressable : View;

  return (
    <Row
      {...(onMessage || onHold
        ? {
            onPress: onMessage,
            onLongPress: onHold,
            accessibilityRole: "button" as const,
            accessibilityLabel: blocked
              ? `${member.nickname ?? "Them"}, blocked`
              : onMessage
                ? `Message ${member.nickname ?? "them"}`
                : (member.nickname ?? "Member"),
          }
        : {})}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingHorizontal: theme.space(4),
        paddingVertical: theme.space(1),
        /* A blocked row is faded the way an offline one is, and for the same
           reason: they are still on the server and still in the list, and
           removing them would leave nowhere to unblock from. */
        opacity: blocked ? 0.4 : faded ? 0.55 : 1,
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
        {/* Said out loud rather than left to the fade. A row that has quietly
            gone dim is not an explanation for why somebody stopped talking,
            and it is the only thing on screen that says a long press has
            something behind it. */}
        {blocked ? (
          <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 11.5 }}>
            Blocked
          </Text>
        ) : room ? (
          <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 11.5 }}>
            {room}
          </Text>
        ) : null}
      </View>

      <RoleChip role={member.role} />
    </Row>
  );
}

/**
 * The dot on the corner of a face.
 *
 * Read off `voiceChannelId` first, for the same reason `presenceGroups` is: the
 * server derives `status` from `hasJoinedChannel` and sends the channel
 * separately, so a dot taken from `status` could disagree with the group the
 * row is sitting in.
 *
 * Exported because the direct message rows want the same dot. Two copies of a
 * four-colour rule is two chances for a phone to disagree with itself about
 * whether somebody is about.
 */
export function StatusDot({
  member,
  ring,
}: {
  member: Member;
  /**
   * What the dot is punched out of, when it is not the drawer.
   *
   * The ring exists to separate the dot from the face behind it, so it has to
   * be the colour of whatever the row is sitting on. Left at `surface` on the
   * sidebar — which is `bg` — it stops reading as a cut-out and starts reading
   * as a second, darker dot.
   */
  ring?: string;
}) {
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
        borderColor: ring ?? theme.color.surface,
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
