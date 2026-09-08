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
import { aroundCount } from "../connection/presence";
import { groupMembersByRole, OFFLINE_GROUP_KEY } from "../connection/roleGroups";
import { readableRoleColor } from "./roleColor";
import type { Channel, Member, UserStatus } from "../connection/types";

/**
 * Everyone on the server, from the right. **A `Drawer` rather than a `Sheet`**: a
 * drawer is React Native's own `Modal`, so context crosses it.
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
   * Start a direct message, by tapping the row. Absent on a server too old to
   * have them, so the row goes inert rather than offering a refusal.
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
   * Each role's colour, pulled into a band this surface can carry. Built here
   * rather than per row; they arrive on `server:details`.
   */
  const roleColors = useMemo(() => {
    const map = new Map<string, string>();
    for (const role of info?.roles ?? []) {
      const colour = readableRoleColor(role.color, theme.color.surface);
      if (colour) map.set(role.id, colour);
    }
    return map;
  }, [info?.roles, theme.color.surface]);

  /* What each role is called, for the second line on a row belonging to somebody
   * who holds more than one. Ids are what the member list carries. */
  const roleNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const role of info?.roles ?? []) map.set(role.id, role.name ?? role.id);
    return map;
  }, [info?.roles]);

  /**
   * The long press on a member row. **Two kinds of thing in one sheet, and the
   * order says which**: moderator actions first, then blocking.
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
       afterwards rather than about the write. Undoing any of them asks nothing. */
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
      /* Ban asks nothing here and opens a form instead: it is the one action with
         choices to make. The drawer closes first, or the screen is pushed behind
         a modal still on top of it (GRYT-836). */
      case "ban":
        onOpenChange(false);
        return void router.push({ pathname: "/ban/[id]", params: { id } });
      /* Reporting opens a form for the same reason a ban does: it carries something
         typed. Unlike a ban it is not a moderator act. */
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

  /* Grouped by role, matching the desktop client rule for rule. The voice strip
     above already answers "who is about". See `roleGroups.ts`. */
  const groups = groupMembersByRole(all, info?.roles ?? []);
  const { total } = aroundCount(all);
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
              Members
            </Text>
            {/* The desktop's heading, count and all. "Who's about" and a
                present-over-total went with grouping by presence; the list is
                cut by role now and the headings carry who is here. */}
            <Text style={{ color: theme.color.muted, fontSize: 13 }}>
              {total}
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
                <GroupHeading label={group.title} count={group.members.length} />
                {group.members.map((member) => (
                  <MemberRow
                    key={member.serverUserId}
                    member={member}
                    faded={group.key === OFFLINE_GROUP_KEY}
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
                    /* Every role they hold, named. The chip on the right shows the
                       top one; this is the rest. */
                    otherRoles={(member.roles ?? [])
                      .slice(1)
                      .map((id) => roleNames.get(id) ?? id)}
                    /* Which room they are in, on any row now rather than only under
                       a voice heading — there is no voice group to be under. */
                    room={roomName.get(member.voiceChannelId ?? "") ?? null}
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
 * A group's name, and how many are in it. **The padding and the margin that cancels
 * it are a workaround**: on Android the first `Text` in a row is laid out a few dp
 * narrow when anything above it has horizontal padding, and clips.
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
   * The roles below their top one, named. On the second line rather than as more
   * chips: a phone row is one chip wide, and the desktop splits the same way.
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

  /* A `Pressable` only when there is something to press. One that responds to a tap
     by doing nothing reads as broken. */
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
        /* A blocked row is faded the way an offline one is: they are still on the
           server, and removing them leaves nowhere to unblock from. */
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
          /* Last of the three, because the other two are more urgent: where somebody
             is, and being blocked, explain why they have gone quiet. */
          <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 11.5 }}>
            {otherRoles.join(", ")}
          </Text>
        ) : null}
      </View>

    </Row>
  );
}

/**
 * The dot on the corner of a face. **Read off `voiceChannelId` first** — a dot from
 * `status` can disagree with the group the row sits in. Exported, so there is one.
 */
export function StatusDot({
  member,
  ring,
}: {
  member: Member;
  /**
   * What the dot is punched out of. **It has to be the colour of whatever the row
   * sits on**, or it reads as a second, darker dot.
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

