import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Drawer, Text, useTheme } from "@gryt/ui-native";
import { XIcon } from "phosphor-react-native/src/icons/X";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { useMembers } from "../connection/MembersProvider";
import { useBlocks } from "../connection/BlocksProvider";
import { useServerConnection } from "../connection/ConnectionsProvider";
import { canOnServer } from "../connection/permissions";
import { dangerIndices, memberActions, type MemberActionKind } from "../moderation/memberActions";
import { useModeration } from "../moderation/useModeration";
import { useActionSheet, useConfirm } from "../ui/actionSheet";
import { aroundCount, presenceGroups } from "../connection/presence";
import { readableRoleColor } from "./roleColor";
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
  const { state } = useServerConnection();
  const { kick, setMuted, setDeafened } = useModeration();
  const sheet = useActionSheet();
  const confirm = useConfirm();

  const info = state.status === "ready" ? state.details : undefined;

  /**
   * Each role's colour, already pulled into a band this surface can carry.
   *
   * Built here rather than per row: the fix is a small loop and there is no
   * reason to run it once per member when there are only ever a handful of
   * roles. Roles arrive on `server:details` — the same list the moderation
   * sheet reads — so nothing new is asked of the server.
   */
  const roleColors = useMemo(() => {
    const map = new Map<string, string>();
    for (const role of info?.roles ?? []) {
      const colour = readableRoleColor(role.color, theme.color.surface);
      if (colour) map.set(role.id, colour);
    }
    return map;
  }, [info?.roles, theme.color.surface]);

  /* What each role is called, for the second line on a row belonging to
   * somebody who holds more than one. Ids are what the member list carries;
   * "mod" is not what the operator named it. */
  const roleNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const role of info?.roles ?? []) map.set(role.id, role.name ?? role.id);
    return map;
  }, [info?.roles]);

  /**
   * The long press on a member row.
   *
   * A sheet rather than a second tap target on the row: the row already opens a
   * conversation, and none of this belongs a thumb's width from that.
   *
   * **Two kinds of thing in one sheet, and the order says which is which.**
   * Moderator actions first, then blocking. Blocking is not moderation — it is
   * something anybody may do, it needs no permission, and it changes only what
   * you see. Kicking changes what everybody sees. They share a sheet because
   * they share a row, not because they are the same act.
   *
   * Every confirmation here is about the consequence rather than the write.
   * Unblocking and unmuting ask nothing: they only ever give back.
   */
  const held = async (member: Member) => {
    const name = member.nickname ?? "them";
    const id = member.serverUserId;

    const actions = memberActions({
      name,
      myRole: info?.role,
      targetRole: member.role,
      roles: info?.roles ?? [],
      can: (permission) => canOnServer(info, permission),
      isServerMuted: member.isServerMuted === true,
      isServerDeafened: member.isServerDeafened === true,
      isBlocked: isBlocked(id),
    });

    const index = await sheet({
      title: name,
      options: [...actions.map((a) => a.label), "Cancel"],
      destructiveButtonIndex: dangerIndices(actions),
      cancelButtonIndex: actions.length,
    });

    const chosen = actions[index];
    if (!chosen) return;

    /* The four that need a second answer. Each message is about what happens
       afterwards rather than about the write — somebody reaching for this has
       usually just been sent something they did not want, and "are you sure"
       does not tell them anything they are deciding between. Undoing any of
       them asks nothing: it only ever gives back. */
    const warning: Partial<Record<MemberActionKind, { title: string; message: string; confirm: string }>> = {
      kick: {
        title: `Kick ${name}?`,
        message: "They are removed from the server and can join again on the same invite.",
        confirm: "Kick",
      },
      block: {
        title: `Block ${name}?`,
        message:
          "You will stop seeing what they write here, and neither of you can start a conversation with the other. They are not told.",
        confirm: "Block",
      },
    };

    const ask = warning[chosen.kind];
    if (ask && !(await confirm(ask))) return;

    switch (chosen.kind) {
      /* Ban asks nothing here and opens a form instead (GRYT-836). It is the
         one action with choices to make — how long, whether their messages go,
         whether the invite they arrived on closes — and a yes/no sheet could
         only ever send one set of defaults. The drawer closes first, or the
         screen is pushed behind a modal that is still on top of it. */
      case "ban":
        onOpenChange(false);
        return void router.push({ pathname: "/ban/[id]", params: { id } });
      /* Reporting opens a form for the same reason a ban does: it carries
         something typed, and a yes/no sheet cannot ask for a reason. Unlike a
         ban it is not a moderator act — see `ReportUserScreen`. */
      case "report":
        onOpenChange(false);
        return void router.push({ pathname: "/report-user/[id]", params: { id } });
      case "mute": return void setMuted(id, true);
      case "unmute": return void setMuted(id, false);
      case "deafen": return void setDeafened(id, true);
      case "undeafen": return void setDeafened(id, false);
      case "kick": return void kick(id);
      case "block": return void block(id);
      case "unblock": return void unblock(id);
    }
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
                    roleColor={member.role ? (roleColors.get(member.role) ?? null) : null}
                    /* Every role they hold, named. The chip on the right still
                       shows the top one; this is the rest, and it is the only
                       place on the phone that says somebody is two things. */
                    otherRoles={(member.roles ?? [])
                      .slice(1)
                      .map((id) => roleNames.get(id) ?? id)}
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
  roleColor,
  otherRoles,
}: {
  member: Member;
  /** Their role's colour, already made readable. Null when it has none. */
  roleColor: string | null;
  /**
   * The roles below their top one, named. Empty for almost everybody.
   *
   * On the second line rather than as more chips beside the first: a phone row
   * is one chip wide, and the desktop makes the same split — the name is
   * coloured by the highest ranked role and the full list lives somewhere with
   * room for it.
   */
  otherRoles: string[];
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
          style={{ color: roleColor ?? theme.color.text, fontSize: 15, fontWeight: "500" }}
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
        ) : otherRoles.length > 0 ? (
          /* Last of the three, because the other two are more urgent: where
             somebody is right now is why you are looking at the row, and being
             blocked explains why they have gone quiet. */
          <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 11.5 }}>
            {otherRoles.join(", ")}
          </Text>
        ) : null}
      </View>

      <RoleChip role={member.role} colour={roleColor} />
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
function RoleChip({ role, colour }: { role?: string; colour: string | null }) {
  const theme = useTheme();

  if (!role || role === "member") return null;

  /* The role's own colour when it has one. The accent/secondary pair was a
     stand-in from before the server sent colours down, and it made every role
     that was not owner look like the same role. */
  const tone = colour ?? (role === "owner" ? theme.color.accent : theme.color.secondary);

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
