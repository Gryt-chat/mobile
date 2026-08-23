import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import { MicrophoneIcon } from "phosphor-react-native/src/icons/Microphone";
import { MicrophoneSlashIcon } from "phosphor-react-native/src/icons/MicrophoneSlash";
import { PhoneDisconnectIcon } from "phosphor-react-native/src/icons/PhoneDisconnect";
import { SpeakerHighIcon } from "phosphor-react-native/src/icons/SpeakerHigh";
import { SpeakerSlashIcon } from "phosphor-react-native/src/icons/SpeakerSlash";

import { Faces } from "./Faces";
import { useShell } from "./ShellContext";
import { useMembers } from "../connection/MembersProvider";
import { occupiedRooms, type VoiceRoom } from "../connection/presence";
import type { Channel } from "../connection/types";

/**
 * What is happening in voice, above the channel list.
 *
 * The point of it is that a voice channel with three people in it should not
 * look like an empty one, which is exactly what the list did on its own. The
 * strip answers "is anybody about" without a tap, and the list underneath stays
 * the index it always was.
 *
 * **It draws nothing when nothing is happening.** No empty state, no "nobody is
 * in voice" — a quiet server gets the screen it has today, and the strip is a
 * thing that appears when there is something to say.
 *
 * **Presence, not activity.** Faces and a count, and no muted, deafened or
 * speaking anywhere on it. Those events only matter while you are looking at a
 * call, and the app only subscribes to them while the voice sheet is open — so
 * this screen costs nothing in radio or re-renders while somebody across the
 * server taps mute. Your own mute and deafen do show on the panel below,
 * because those are local state on the shell rather than anything subscribed.
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

  /* The room you are in leaves the strip and becomes the panel. Matched on the
   * channel rather than on your own member row, because the member list can be
   * a beat behind your own join and the shell knows immediately. */
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

      {others.length > 0 ? (
        <>
          <Heading label={mine ? "Also live" : "Live now"} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: theme.space(4),
              paddingTop: theme.space(2),
              paddingBottom: theme.space(1),
              gap: theme.space(2),
            }}
          >
            {others.map((room) => (
              <RoomCard key={room.channel.id} room={room} onPress={onAskToJoin} />
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

function Heading({ label }: { label: string }) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(2),
        paddingHorizontal: theme.space(4),
        paddingTop: theme.space(4),
      }}
    >
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          backgroundColor: theme.color.success,
        }}
      />
      <Text
        style={{
          color: theme.color.muted,
          fontSize: 12,
          fontWeight: "700",
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** One room with somebody in it. Tapping asks to join, the way a row does. */
function RoomCard({
  room,
  onPress,
}: {
  room: VoiceRoom;
  onPress: (channel: Channel) => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => onPress(room.channel)}
      accessibilityRole="button"
      accessibilityLabel={`${room.channel.name}, ${peopleHere(room.members.length)}. Join`}
      style={({ pressed }) => ({
        width: 168,
        padding: theme.space(3),
        borderRadius: theme.radius.lg,
        backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surface,
        borderWidth: 1,
        borderColor: theme.color.border,
      })}
    >
      <Text
        numberOfLines={1}
        style={{ color: theme.color.text, fontSize: 15, fontWeight: "600" }}
      >
        {room.channel.name}
      </Text>
      <Text style={{ color: theme.color.muted, fontSize: 12, marginTop: 1 }}>
        {peopleHere(room.members.length)}
      </Text>
      <View style={{ marginTop: theme.space(2) }}>
        <Faces members={room.members} size={32} ground={theme.color.surface} />
      </View>
    </Pressable>
  );
}

/**
 * The call you are in, at the top of the tab.
 *
 * There is no separate call bar over the tab bar, because this is already the
 * top of the screen and already the thing that says what is happening in voice
 * — growing it is cheaper than a second piece of chrome that says the same.
 *
 * The controls here are mute, deafen and leave, and no more. Anything that
 * needs to *see* the call — tiles, video, the output picker — is the sheet's,
 * which the phone in the tab bar reopens.
 */
function CallPanel({ room }: { room: VoiceRoom }) {
  const theme = useTheme();
  const { voice, toggleVoice, setVoiceChannel } = useShell();

  return (
    <View
      style={{
        margin: theme.space(4),
        marginBottom: theme.space(1),
        padding: theme.space(3),
        borderRadius: theme.radius.lg,
        backgroundColor: theme.color.surfaceRaised,
        borderWidth: 1,
        borderColor: theme.color.accent,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2) }}>
        <SpeakerHighIcon size={20} color={theme.color.accent} weight="fill" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ color: theme.color.text, fontSize: 17, fontWeight: "600" }}
          >
            {room.channel.name}
          </Text>
          <Text style={{ color: theme.color.success, fontSize: 12.5 }}>
            {connectedWith(room.members.length)}
          </Text>
        </View>
      </View>

      {room.members.length > 0 ? (
        <View style={{ marginTop: theme.space(3) }}>
          <Faces
            members={room.members}
            size={32}
            limit={8}
            ground={theme.color.surfaceRaised}
          />
        </View>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2), marginTop: theme.space(3) }}>
        <ControlButton
          on={voice.muted}
          label={voice.muted ? "Unmute" : "Mute"}
          onPress={() => toggleVoice("muted")}
          icon={(color) =>
            voice.muted ? (
              <MicrophoneSlashIcon size={18} weight="fill" color={color} />
            ) : (
              <MicrophoneIcon size={18} color={color} />
            )
          }
        />
        <ControlButton
          on={voice.deafened}
          label={voice.deafened ? "Undeafen" : "Deafen"}
          onPress={() => toggleVoice("deafened")}
          icon={(color) =>
            voice.deafened ? (
              <SpeakerSlashIcon size={18} weight="fill" color={color} />
            ) : (
              <SpeakerHighIcon size={18} color={color} />
            )
          }
        />

        <Pressable
          onPress={() => setVoiceChannel(null)}
          accessibilityRole="button"
          accessibilityLabel="Leave the call"
          style={({ pressed }) => ({
            marginLeft: "auto",
            flexDirection: "row",
            alignItems: "center",
            gap: theme.space(2),
            height: 40,
            paddingHorizontal: theme.space(4),
            borderRadius: 999,
            backgroundColor: theme.color.danger,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <PhoneDisconnectIcon size={17} weight="fill" color={theme.color.onDanger} />
          <Text style={{ color: theme.color.onDanger, fontSize: 14, fontWeight: "700" }}>
            Leave
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** The same shape the sheet's controls have, at the size a panel wants. */
function ControlButton({
  on,
  label,
  icon,
  onPress,
}: {
  on: boolean;
  label: string;
  icon: (color: string) => ReactNode;
  onPress: () => void;
}) {
  const theme = useTheme();
  const tint = on ? theme.color.onAccent : theme.color.text;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: on ? theme.color.accent : theme.color.bg,
        borderWidth: 1,
        borderColor: on ? theme.color.accent : theme.color.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon(tint)}
    </Pressable>
  );
}

function peopleHere(count: number): string {
  return count === 1 ? "1 here" : `${count} here`;
}

/**
 * What the panel says under the room name.
 *
 * `members` counts you, because the server counts you — so "you and 3 others"
 * comes off a length of 4. A zero means the member list has not caught up with
 * your own join yet, which is a real moment and not an error.
 */
function connectedWith(count: number): string {
  const others = Math.max(0, count - 1);
  if (others === 0) return "Connected";
  if (others === 1) return "Connected · you and 1 other";
  return `Connected · you and ${others} others`;
}
