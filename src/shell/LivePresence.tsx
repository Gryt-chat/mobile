import { Pressable, View } from "react-native";
import { Text, useTheme, useToast } from "@gryt/ui-native";
import { MicrophoneIcon } from "phosphor-react-native/src/icons/Microphone";
import { MicrophoneSlashIcon } from "phosphor-react-native/src/icons/MicrophoneSlash";
import { PhoneDisconnectIcon } from "phosphor-react-native/src/icons/PhoneDisconnect";
import { SignOutIcon } from "phosphor-react-native/src/icons/SignOut";
import { SpeakerHighIcon } from "phosphor-react-native/src/icons/SpeakerHigh";
import { SpeakerSlashIcon } from "phosphor-react-native/src/icons/SpeakerSlash";

import { Faces } from "./Faces";
import { useShell } from "./ShellContext";
import { useMembers } from "../connection/MembersProvider";
import { useServerConnection } from "../connection/ConnectionsProvider";
import { callControlColors, hearingState, microphoneState, type CallControlState } from "../voice/callControlState";
import { occupiedRooms, type VoiceRoom } from "../connection/presence";
import type { Channel } from "../connection/types";
import { useInACall } from "../voice/useInACall";

/**
 * What is happening in voice, above the channel list, and nothing when nothing is.
 * Presence, not activity: faces and a count, so a mute across the server costs nothing.
 */
export function LivePresence({
  channels,
  onAskToJoin,
}: {
  channels: Channel[];
  /** The strip asks; it does not join. Same question the rows ask. */
  onAskToJoin: (channel: Channel) => void;
}) {
  const theme = useTheme();
  const { all } = useMembers();
  const { voiceChannel } = useShell();

  const rooms = occupiedRooms(channels, all);

  /* The room you are in leaves the strip and becomes the panel. Matched on the channel,
   * because the member list can be a beat behind your own join. */
  const mine = voiceChannel
    ? (rooms.find((r) => r.channel.id === voiceChannel.id) ?? {
        channel: voiceChannel,
        members: [],
      })
    : null;
  const others = rooms.filter((r) => r.channel.id !== voiceChannel?.id);

  if (!mine && others.length === 0) return null;

  return (
    <View>
      {mine ? <CallPanel room={mine} /> : null}

      {others.map((room) => (
        <RoomCard key={room.channel.id} room={room} label={mine ? "Also live" : "Live now"} onPress={onAskToJoin} />
      ))}
    </View>
  );
}

/** One room with somebody in it. Tapping asks to join, the way a row does. */
function RoomCard({
  room,
  label,
  onPress,
}: {
  room: VoiceRoom;
  label: string;
  onPress: (channel: Channel) => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        marginHorizontal: theme.space(4),
        marginTop: theme.space(2),
        paddingVertical: theme.space(3),
        paddingLeft: theme.space(3.5),
        paddingRight: theme.space(3),
        borderRadius: theme.radius.lg,
        backgroundColor: theme.color.surface,
        borderWidth: 1,
        borderColor: theme.color.border,
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
      }}
    >
      <RoomTile active={false} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: theme.color.muted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
        <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 16, fontWeight: "600" }}>
          {room.channel.name}
        </Text>
      </View>
      <Faces members={room.members} size={24} limit={3} ground={theme.color.surface} />
      <Pressable
        onPress={() => onPress(room.channel)}
        accessibilityRole="button"
        accessibilityLabel={`Join ${room.channel.name}, ${peopleHere(room.members.length)}`}
        style={({ pressed }) => ({
          height: 36,
          paddingHorizontal: theme.space(4),
          borderRadius: 999,
          justifyContent: "center",
          backgroundColor: theme.color.accent,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text style={{ color: theme.color.onAccent, fontSize: 15, fontWeight: "600" }}>Join</Text>
      </Pressable>
    </View>
  );
}

function RoomTile({ active }: { active: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: 11,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? theme.color.accent : theme.color.surfaceRaised,
      }}
    >
      <SpeakerHighIcon size={17} weight="fill" color={active ? theme.color.onAccent : theme.color.muted} />
    </View>
  );
}

/**
 * The call you are in, at the top of the tab — no separate call bar. **Mute, deafen
 * and leave, and no more**: anything that needs to *see* the call is the sheet's.
 */
function CallPanel({ room }: { room: VoiceRoom }) {
  // A call is hung up; a voice channel is only left (GRYT-1785).
  const inACall = useInACall();
  const theme = useTheme();
  const { voice, toggleVoice, setVoiceChannel } = useShell();
  const { me } = useServerConnection();
  const { byId } = useMembers();
  const self = me?.serverUserId ? byId.get(me.serverUserId) : undefined;
  const serverMuted = self?.isServerMuted === true;
  const serverDeafened = self?.isServerDeafened === true;
  const toast = useToast();

  const muted = voice.muted || serverMuted;
  const deaf = voice.deafened || serverDeafened;

  return (
    <View
      style={{
        marginHorizontal: theme.space(4),
        marginTop: theme.space(2),
        padding: theme.space(3.5),
        gap: theme.space(3),
        borderRadius: theme.radius.lg,
        backgroundColor: theme.color.surface,
        borderWidth: 1,
        borderColor: theme.color.accent,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
        <RoomTile active />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 16, fontWeight: "700" }}>
            {room.channel.name}
          </Text>
          <Text style={{ color: theme.color.success, fontSize: 12.5 }}>
            {connectedWith(room.members.length)}
          </Text>
        </View>
        {room.members.length > 0 ? (
          <Faces members={room.members} size={24} limit={3} ground={theme.color.surface} />
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: theme.space(2) }}>
        <PillControl
          state={microphoneState(voice.muted, serverMuted)}
          label={muted ? "Unmute" : "Mute"}
          onPress={() =>
            serverMuted ? toast.show({ title: "You are server muted by an admin." }) : toggleVoice("muted")
          }
          icon={(color) =>
            muted ? <MicrophoneSlashIcon size={16} weight="fill" color={color} /> : <MicrophoneIcon size={16} color={color} />
          }
        />
        <PillControl
          state={hearingState(voice.deafened, serverDeafened)}
          label={deaf ? "Undeafen" : "Deafen"}
          onPress={() =>
            serverDeafened ? toast.show({ title: "You are server deafened by an admin." }) : toggleVoice("deafened")
          }
          icon={(color) =>
            deaf ? <SpeakerSlashIcon size={16} weight="fill" color={color} /> : <SpeakerHighIcon size={16} color={color} />
          }
        />
        <Pressable
          onPress={() => setVoiceChannel(null)}
          accessibilityRole="button"
          accessibilityLabel="Leave the call"
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: theme.space(1.5),
            height: 40,
            borderRadius: 999,
            backgroundColor: theme.color.danger,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          {inACall ? <PhoneDisconnectIcon size={16} weight="fill" color={theme.color.onDanger} /> : <SignOutIcon size={16} weight="fill" color={theme.color.onDanger} />}
          <Text style={{ color: theme.color.onDanger, fontSize: 14, fontWeight: "600" }}>Leave</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PillControl({
  state,
  label,
  onPress,
  icon,
}: {
  state: CallControlState;
  label: string;
  onPress: () => void;
  icon: (color: string) => React.ReactNode;
}) {
  const theme = useTheme();
  const colors = callControlColors(theme, state);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.space(1.5),
        height: 40,
        borderRadius: 999,
        backgroundColor: pressed ? colors.pressed : colors.background,
        opacity: colors.opacity,
      })}
    >
      {icon(colors.tint)}
      <Text style={{ color: colors.tint, fontSize: 14, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

function peopleHere(count: number): string {
  return count === 1 ? "1 here" : `${count} here`;
}

/**
 * What the panel says under the room name. `members` counts you, so "you and 3 others"
 * comes off a length of 4. Zero means the list has not caught up with your join.
 */
function connectedWith(count: number): string {
  const others = Math.max(0, count - 1);
  if (others === 0) return "Connected";
  if (others === 1) return "Connected · you and 1 other";
  return `Connected · you and ${others} others`;
}
