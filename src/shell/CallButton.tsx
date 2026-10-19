import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import { MicrophoneIcon } from "phosphor-react-native/src/icons/Microphone";
import { MicrophoneSlashIcon } from "phosphor-react-native/src/icons/MicrophoneSlash";
import { PhoneIcon } from "phosphor-react-native/src/icons/Phone";
import { PhoneDisconnectIcon } from "phosphor-react-native/src/icons/PhoneDisconnect";
import { SignOutIcon } from "phosphor-react-native/src/icons/SignOut";
import { SpeakerHighIcon } from "phosphor-react-native/src/icons/SpeakerHigh";
import { SpeakerSlashIcon } from "phosphor-react-native/src/icons/SpeakerSlash";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { avatarSource } from "../chat/files";
import { useAllConversations } from "../connection/AllConversationsProvider";
import { conversationTitle } from "../connection/directMessages";
import { ServerIcon } from "../servers/ServerIcon";
import { GroupFace } from "./GroupFace";
import { useShell } from "./ShellContext";
import { BAR, useBarBottom } from "./TabBar";
import { useInACall } from "../voice/useInACall";

/** 56pt. Larger than a tab's 52 capsule, because it is not one of them. */
const SIZE = 56;

/**
 * The way back into a call (P7, P9, P12): the call's face in a green ring with a phone
 * badge. A long press fans out mute, deafen and leave. Only while a call exists.
 */
export function CallButton({ inCall, onPress }: { inCall: boolean; onPress: () => void }) {
  // A call is hung up; a voice channel is only left (GRYT-1785).
  const inACall = useInACall();
  const theme = useTheme();
  const barBottom = useBarBottom();
  const { server, servers, voiceChannel, voice, toggleVoice, setVoiceChannel } = useShell();
  const conversations = useAllConversations();
  const [fanned, setFanned] = useState(false);

  /* Unmounted rather than hidden: it has no resting state to animate out to, and a
     pressable with `opacity: 0` still takes touches from the page underneath. */
  if (!inCall || !voiceChannel) return null;

  const host = server?.host ?? "";
  const entry = conversations.find((e) => e.host === host && e.conversation.conversation_id === voiceChannel.id);
  const title = entry ? conversationTitle(entry.conversation) : voiceChannel.name;

  // The green the desktop capsule uses; in light mode the dark end, so the ring stays readable.
  const ring = theme.appearance === "light" ? theme.scales.success[10] : theme.scales.success[8];

  // A DM's person, a group's faces, or the server's icon filling the circle.
  const serverFace = (
    <View style={{ margin: -SIZE * 0.21 }}>
      <ServerIcon host={host} name={servers.find((s) => s.host === host)?.name ?? host} size={Math.ceil(SIZE * 1.42)} />
    </View>
  );
  const personFace = entry && entry.conversation.kind !== "group" ? (
    <PersonAvatar
      name={entry.conversation.other.nickname}
      source={entry.conversation.other.avatar_file_id ? avatarSource(host, entry.conversation.other.avatar_file_id) : null}
      size={SIZE}
      variant="bare"
    />
  ) : serverFace;
  const face = entry?.conversation.kind === "group" ? (
    <GroupFace host={host} conversation={entry.conversation} size={SIZE} round />
  ) : personFace;

  const bottom = barBottom + BAR.height + BAR.gap;
  const fanItem = (label: string, icon: React.ReactNode, onItem: () => void, danger = false) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        onItem();
        if (danger) setFanned(false);
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        height: 44,
        paddingLeft: 12,
        paddingRight: 16,
        borderRadius: 22,
        backgroundColor: danger ? theme.color.danger : theme.color.surfaceRaised,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {icon}
      <Text style={{ color: danger ? theme.color.onDanger : theme.color.text, fontSize: 15, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      {fanned ? (
        /* The page dims under the fan; a tap anywhere else folds it back. */
        <Pressable
          accessibilityLabel="Close call controls"
          onPress={() => setFanned(false)}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(5,6,9,0.55)" }}
        />
      ) : null}

      {fanned ? (
        <View pointerEvents="box-none" style={{ position: "absolute", right: BAR.inset, bottom: bottom + SIZE + 12, alignItems: "flex-end", gap: 8 }}>
          <Text numberOfLines={1} style={{ color: ring, fontSize: 12, fontWeight: "700", paddingRight: 6 }}>{title}</Text>
          {fanItem(
            voice.muted ? "Unmute" : "Mute",
            voice.muted ? <MicrophoneSlashIcon size={18} color={theme.color.danger} /> : <MicrophoneIcon size={18} color={theme.color.text} />,
            () => toggleVoice("muted"),
          )}
          {fanItem(
            voice.deafened ? "Undeafen" : "Deafen",
            voice.deafened ? <SpeakerSlashIcon size={18} color={theme.color.danger} /> : <SpeakerHighIcon size={18} color={theme.color.text} />,
            () => toggleVoice("deafened"),
          )}
          {fanItem("Leave", (inACall ? <PhoneDisconnectIcon size={18} color={theme.color.onDanger} weight="fill" /> : <SignOutIcon size={18} color={theme.color.onDanger} weight="fill" />), () => setVoiceChannel(null), true)}
        </View>
      ) : null}

      <View pointerEvents="box-none" style={{ position: "absolute", right: BAR.inset, bottom }}>
        <Pressable
          onPress={() => {
            setFanned(false);
            onPress();
          }}
          onLongPress={() => setFanned((was) => !was)}
          accessibilityRole="button"
          accessibilityLabel={`Show the call, ${title}`}
          accessibilityHint="Hold for mute, deafen and leave"
          hitSlop={8}
          style={({ pressed }) => ({
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            borderWidth: 3,
            borderColor: ring,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View style={{ flex: 1, borderRadius: SIZE / 2, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: theme.scales.success[2] }}>
            {face}
          </View>
          <View
            style={{
              position: "absolute",
              right: -5,
              bottom: -5,
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: ring,
              borderWidth: 2,
              borderColor: theme.color.bg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <PhoneIcon size={11} weight="fill" color={theme.appearance === "light" ? theme.scales.neutral[11] : theme.scales.neutral[0]} />
          </View>
        </Pressable>
      </View>
    </>
  );
}
