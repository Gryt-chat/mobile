import { Modal, Pressable, ScrollView, useWindowDimensions } from "react-native";

import { useCustomEmojis } from "../chat/CustomEmojiProvider";
import { attachmentUrl } from "../chat/files";
import { useMembers } from "../connection/MembersProvider";
import type { Member } from "../connection/types";
import { MemberCard } from "./MemberCard";
import { owlColour } from "./owlColour";

/**
 * A member's card over whatever opened it. React Native's own `Modal` rather than a `Sheet`,
 * so the members and emoji contexts reach it; a tap outside closes it.
 */
export function MemberCardModal({
  member,
  host,
  channelName,
  onClose,
  onMessage,
  onMore,
}: {
  member: Member | undefined;
  host: string | null;
  channelName?: string;
  onClose: () => void;
  onMessage?: () => void;
  onMore?: () => void;
}) {
  const { width } = useWindowDimensions();
  const { avatarUrlFor, nameTags } = useMembers();
  const customEmojis = useCustomEmojis();
  const cardWidth = Math.min(width - 32, 380);

  // A video banner shows its still: the thumbnail of a video is a JPEG an `Image` can draw.
  const bannerUrl = member?.bannerFileId && host ? attachmentUrl(host, member.bannerFileId, member.bannerVideo === true) : null;

  return (
    <Modal visible={member !== undefined} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close the card"
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          {member ? (
            // Swallows the tap, so pressing the card itself doesn't close it.
            <Pressable onPress={() => {}} accessible={false}>
              <MemberCard
                member={member}
                owlHex={owlColour(member.nickname, member.avatarWorn)}
                avatarUrl={avatarUrlFor(member)}
                bannerUrl={bannerUrl}
                nameTag={nameTags.get(member.serverUserId)}
                customEmojis={customEmojis}
                channelName={channelName}
                width={cardWidth}
                onMessage={onMessage}
                onMore={onMore}
              />
            </Pressable>
          ) : null}
        </ScrollView>
      </Pressable>
    </Modal>
  );
}
