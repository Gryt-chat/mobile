import { useEffect, useMemo, useState } from "react";
import { Image, Modal, PanResponder, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Button, Text, useTheme } from "@gryt/ui-native";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";
import { DoorOpenIcon } from "phosphor-react-native/src/icons/DoorOpen";
import { ArchiveIcon } from "phosphor-react-native/src/icons/Archive";
import type { Socket } from "socket.io-client";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { MemberCard } from "../card/MemberCard";
import { owlColour } from "../card/owlColour";
import { useCustomEmojis } from "../chat/CustomEmojiProvider";
import { attachmentSource, attachmentUrl, avatarSource, isImage, type Attachment } from "../chat/files";
import type { DirectConversation } from "../connection/directMessages";
import { conversationTitle } from "../connection/directMessages";
import { useMembers } from "../connection/MembersProvider";
import type { Member, Message } from "../connection/types";
import { STATUS_LABEL, type Status } from "./data";
import { GroupFace } from "./GroupFace";
import { statusColor } from "./MessagesScreen";
import { useSheetInsets } from "./useFold";
import Animated, { SlideInDown } from "react-native-reanimated";

function pinFallback(sealed: boolean, attachments: number): string {
  if (sealed) return "Encrypted message";
  return attachments ? "Attachment" : "";
}

/**
 * Tapping a conversation's header (P4): their card, what's pinned and the files in it, or
 * for a group its people. A `Modal` rather than a `Sheet`, so the providers reach it.
 */
export function DmInfoSheet({
  open,
  onClose,
  host,
  socket,
  conversation,
  files,
  onPickPin,
  onEditGroup,
  onLeave,
  onImport,
  askedBy,
}: {
  open: boolean;
  onClose: () => void;
  host: string;
  socket: Socket | null;
  conversation: DirectConversation;
  /** What this conversation has shared, from the messages loaded here. */
  files: Attachment[];
  onPickPin: (messageId: string) => void;
  onEditGroup?: () => void;
  onLeave?: () => void;
  /** Import from Discord (GRYT-1965). Without it the row shows, greyed out. */
  onImport?: () => void;
  /** Their imported messages arrived and none of yours have: offer to add your side. */
  askedBy?: string;
}) {
  const theme = useTheme();
  const sheet = useSheetInsets();
  const window = useWindowDimensions();
  const width = window.width - sheet.left - sheet.right;
  const { byId, avatarUrlFor, nameTags } = useMembers();
  const customEmojis = useCustomEmojis();
  const pins = usePins(open ? socket : null, conversation.conversation_id);
  /* Pulling the handle down closes it, as the handle says it will. A Modal sits outside the
     gesture handler's root, so this is React Native's own responder. */
  const pull = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // A pull down closes it, and so does a tap: the handle is the way out.
        onPanResponderRelease: (_e, g) => {
          if (g.dy > 40 || Math.abs(g.dy) < 6) onClose();
        },
      }),
    [onClose],
  );

  const group = conversation.kind === "group";
  const member: Member | undefined = group ? undefined : byId.get(conversation.other.server_user_id);
  const pictures = files.filter((a) => isImage(a) && !a.processing && !a.refused);
  const section = (title: string, count?: string) => (
    <View style={{ flexDirection: "row", alignItems: "baseline", paddingHorizontal: 2 }}>
      <Text style={{ color: theme.scales.neutral[10], fontSize: 13, fontWeight: "700" }}>{title}</Text>
      {count ? <Text style={{ marginLeft: "auto", color: theme.color.muted, fontSize: 12 }}>{count}</Text> : null}
    </View>
  );

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(5,6,9,0.55)" }} />
      <Animated.View
        entering={SlideInDown.duration(260)}
        style={{
          position: "absolute",
          left: sheet.left,
          right: sheet.right,
          bottom: 0,
          top: 150,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          backgroundColor: theme.color.surface,
          paddingTop: 10,
        }}
      >
        <View {...pull.panHandlers} accessibilityRole="button" accessibilityLabel="Close" style={{ paddingVertical: 10, marginTop: -10 }}>
          <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: theme.color.border }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 16 }}>
          {!!group && (
            <View style={{ alignItems: "center", gap: 8, paddingTop: 8 }}>
              <GroupFace host={host} conversation={conversation} size={72} />
              <Text style={{ color: theme.color.text, fontSize: 20, fontWeight: "700" }}>{conversationTitle(conversation)}</Text>
              <Text style={{ color: theme.color.muted, fontSize: 13 }}>Anybody here can rename it or add people.</Text>
              {onEditGroup ? (
                <Button size="small" tone="neutral" onPress={onEditGroup}>Edit group</Button>
              ) : null}
            </View>
          )}
          {!group && !!member && (
            <MemberCard
              member={member}
              owlHex={owlColour(member.nickname, member.avatarWorn)}
              avatarUrl={avatarUrlFor(member)}
              bannerUrl={member.bannerFileId ? attachmentUrl(host, member.bannerFileId, member.bannerVideo === true) : null}
              bannerVideoUrl={member.bannerFileId && member.bannerVideo === true ? attachmentUrl(host, member.bannerFileId) : null}
              nameTag={nameTags.get(member.serverUserId)}
              customEmojis={customEmojis}
              width={width - 32}
            />
          )}
          {!group && !member && (
            <View style={{ alignItems: "center", gap: 8, paddingTop: 8 }}>
              <PersonAvatar
                name={conversation.other.nickname}
                source={conversation.other.avatar_file_id ? avatarSource(host, conversation.other.avatar_file_id) : null}
                size={72}
              />
              <Text style={{ color: theme.color.text, fontSize: 20, fontWeight: "700" }}>{conversation.other.nickname}</Text>
            </View>
          )}

          {!group ? (
            <Pressable
              onPress={onImport}
              disabled={!onImport}
              accessibilityRole="button"
              accessibilityState={{ disabled: !onImport }}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, opacity: onImport ? 1 : 0.5 }}
            >
              <ArchiveIcon size={18} color={theme.color.muted} />
              <Text style={{ flex: 1, color: theme.color.text, fontSize: 15 }}>Import from Discord</Text>
              {onImport ? null : <Text style={{ color: theme.color.muted, fontSize: 12 }}>Soon</Text>}
            </Pressable>
          ) : null}
          {askedBy && onImport ? (
            <View style={{ gap: 8, padding: 14, borderRadius: 18, backgroundColor: theme.color.surfaceRaised }}>
              <Text style={{ color: theme.color.text, fontSize: 15.5, fontWeight: "700" }}>{askedBy} is bringing your Discord chat over</Text>
              <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 20 }}>
                Your half is in your own Discord data. Add your messages from here. Your files need the desktop app.
              </Text>
              <Button size="small" onPress={onImport}>Add my side</Button>
            </View>
          ) : null}

          {group ? (
            <View style={{ gap: 8 }}>
              {section("Members", `${conversation.members.length + 1} with you`)}
              {conversation.members.map((m) => {
                const status = byId.get(m.server_user_id)?.status as Status | undefined;
                return (
                  <View key={m.server_user_id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}>
                    <PersonAvatar
                      name={m.nickname}
                      source={m.avatar_file_id ? avatarSource(host, m.avatar_file_id) : null}
                      size={32}
                    />
                    <Text numberOfLines={1} style={{ flex: 1, color: theme.color.text, fontSize: 15, fontWeight: "600" }}>{m.nickname}</Text>
                    {status ? <Text style={{ color: statusColor(theme, status), fontSize: 13 }}>{STATUS_LABEL[status]}</Text> : null}
                  </View>
                );
              })}
              {onEditGroup ? (
                <Pressable onPress={onEditGroup} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
                  <PlusIcon size={16} color={theme.color.accent} weight="bold" />
                  <Text style={{ color: theme.color.accent, fontSize: 15, fontWeight: "600" }}>Add someone</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {pins && pins.length > 0 ? (
            <View style={{ gap: 8 }}>
              {section("Pinned", String(pins.length))}
              {pins.slice(0, 3).map((m) => (
                <Pressable
                  key={m.message_id}
                  accessibilityRole="button"
                  onPress={() => {
                    onClose();
                    onPickPin(m.message_id);
                  }}
                  style={({ pressed }) => ({ padding: 12, borderRadius: theme.radius.md, backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised })}
                >
                  <Text numberOfLines={2} style={{ color: theme.color.text, fontSize: 14 }}>
                    {m.text ?? pinFallback(!!m.sealed, m.attachments?.length ?? 0)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
            {section("Shared files", pictures.length > 0 ? String(pictures.length) : undefined)}
            {pictures.length === 0 ? (
              <Text style={{ color: theme.color.muted, fontSize: 13 }}>Nothing shared yet.</Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {pictures.slice(0, 9).map((a) => (
                  <Image
                    key={a.file_id}
                    source={{ uri: attachmentSource(host, a, a.has_thumbnail) }}
                    style={{ width: (width - 32 - 12) / 3, aspectRatio: 1, borderRadius: 8, backgroundColor: theme.color.surfaceRaised }}
                    accessibilityLabel={a.original_name ?? "Image"}
                  />
                ))}
              </View>
            )}
          </View>

          {group && onLeave ? (
            <Pressable onPress={onLeave} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
              <DoorOpenIcon size={16} color={theme.color.danger} />
              <Text style={{ color: theme.color.danger, fontSize: 15, fontWeight: "600" }}>Leave group</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

/** This conversation's pins, asked for while the sheet is open (as PinsDrawer does). */
function usePins(socket: Socket | null, conversationId: string): Message[] | null {
  const [items, setItems] = useState<Message[] | null>(null);
  useEffect(() => {
    if (!socket) return;
    const ask = () => socket.emit("chat:pins", { conversationId });
    const onPins = (p: { conversation_id?: string; items?: Message[] }) => {
      if (p?.conversation_id === conversationId) setItems(Array.isArray(p.items) ? p.items : []);
    };
    const onPinned = (p: { conversation_id?: string }) => {
      if (p?.conversation_id === conversationId) ask();
    };
    socket.on("chat:pins", onPins);
    socket.on("chat:pinned", onPinned);
    ask();
    return () => {
      socket.off("chat:pins", onPins);
      socket.off("chat:pinned", onPinned);
    };
  }, [socket, conversationId]);
  return items;
}
