import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text, useTheme } from "@gryt/ui-native";

import { useCalls } from "../connection/CallsProvider";
import { conversationTitle } from "../connection/directMessages";
import { useDirectMessages } from "../connection/DirectMessagesProvider";
import { useMembers } from "../connection/MembersProvider";
import { PersonAvatar } from "../avatar/PersonAvatar";
import { attachmentUrl } from "../chat/files";
import { useShell } from "./ShellContext";

/**
 * Somebody is ringing.
 *
 * A card at the top rather than a screen of its own. A full-screen incoming
 * call takes the whole screen for thirty seconds to ask one question, and the
 * bottom is the tab bar's, so it goes at the top under the notch.
 *
 * It cannot be dismissed. A ring you swiped away but did not answer is still
 * ringing at the other end. Answer and Decline are the ways out, plus the
 * server withdrawing it.
 *
 * Answering is joining the conversation's room — `setVoiceChannel` with the
 * conversation id, the same thing the channel list does with a channel. The
 * server ends the ring when the join lands, so nothing here says "accepted".
 */
export function IncomingCallCard() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { incoming, accept, decline } = useCalls();
  const { conversations } = useDirectMessages();
  const { byId } = useMembers();
  const { server, setVoiceChannel } = useShell();

  if (!incoming) return null;

  const conversation = conversations.find(
    (c) => c.conversation_id === incoming.conversation_id,
  );

  /* The conversation's own name, which for a group is the group rather than
     whoever is ringing. A call can arrive before `dm:list` has caught up with a
     conversation that was only just made, so the caller is the fallback. */
  const title = conversation ? conversationTitle(conversation) : incoming.from.nickname;

  /* The picture comes from the member list. A ring carries a nickname and
     nothing else on purpose — an appearance copied into it is a second copy to
     go stale. */
  const member = byId.get(incoming.from.server_user_id);
  const avatar =
    server?.host && member?.avatarFileId
      ? attachmentUrl(server.host, member.avatarFileId)
      : null;

  const answer = () => {
    const call = accept();
    if (!call) return;
    /* Shaped as a channel because that is what "the room you are in" means to
       the rest of the app, and the room id is opaque all the way to the SFU.
       Everything downstream — the sheet header, announcing your mute — reads
       the id and the name, and both are right. */
    setVoiceChannel({ id: call.conversation_id, name: title, type: "voice" });
  };

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={`${incoming.from.nickname} is calling`}
      style={{
        position: "absolute",
        top: insets.top + theme.space(2),
        left: theme.space(3),
        right: theme.space(3),
        backgroundColor: theme.color.surfaceRaised,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.color.border,
        padding: theme.space(4),
        gap: theme.space(3),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
        <PersonAvatar name={incoming.from.nickname} source={avatar} size={40} variant="bare" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 17, fontWeight: "600" }}>
            {title}
          </Text>
          {/* Names who, because in a group the title is the group and that is
              not enough to decide whether to pick up. */}
          <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 13 }}>
            {incoming.from.nickname} is calling
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: theme.space(2) }}>
        <Button tone="primary" style={{ flex: 1 }} onPress={answer}>
          Answer
        </Button>
        <Button tone="ghost" style={{ flex: 1 }} onPress={() => decline(incoming.conversation_id)}>
          Decline
        </Button>
      </View>
    </View>
  );
}
