import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { conversationIsGone } from "./channelGone";
import {
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { durations, Spinner, Text, useTheme, useToast } from "@gryt/ui-native";
import { ArrowDownIcon } from "phosphor-react-native/src/icons/ArrowDown";
import { ClipboardIcon } from "phosphor-react-native/src/icons/Clipboard";
import { SignInIcon } from "phosphor-react-native/src/icons/SignIn";
import { PencilSimpleIcon } from "phosphor-react-native/src/icons/PencilSimple";
import { ArrowBendUpLeftIcon } from "phosphor-react-native/src/icons/ArrowBendUpLeft";
import { SmileyIcon } from "phosphor-react-native/src/icons/Smiley";
import { WarningIcon } from "phosphor-react-native/src/icons/Warning";
import { ChatsTeardropIcon } from "phosphor-react-native/src/icons/ChatsTeardrop";
import { RobotIcon } from "phosphor-react-native/src/icons/Robot";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { ArrowUpIcon } from "phosphor-react-native/src/icons/ArrowUp";
import { CameraIcon } from "phosphor-react-native/src/icons/Camera";
import { ImageIcon } from "phosphor-react-native/src/icons/Image";
import { FileIcon } from "phosphor-react-native/src/icons/File";
import { ChartBarIcon } from "phosphor-react-native/src/icons/ChartBar";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { ChatTeardropTextIcon } from "phosphor-react-native/src/icons/ChatTeardropText";
import { HashIcon } from "phosphor-react-native/src/icons/Hash";
import { PhoneIcon } from "phosphor-react-native/src/icons/Phone";
import { ClockIcon } from "phosphor-react-native/src/icons/Clock";
import { UserPlusIcon } from "phosphor-react-native/src/icons/UserPlus";
import { PhoneDisconnectIcon } from "phosphor-react-native/src/icons/PhoneDisconnect";
import { XIcon } from "phosphor-react-native/src/icons/X";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";

import * as Clipboard from "expo-clipboard";

import { useGrytAccount } from "../account/AccountProvider";
import { useConnections, useServerConnection } from "../connection/ConnectionsProvider";
import { useCalls } from "../connection/CallsProvider";
import { useDirectMessages } from "../connection/DirectMessagesProvider";
import { conversationTitle, type DirectConversation } from "../connection/directMessages";
import { useMembers } from "../connection/MembersProvider";
import { KeyChangeCard } from "../chat/KeyChangeCard";
import { asSession, useMlsSource } from "../mls/registry";
import { shareHistory } from "../mls/shareHistory";
import { openLocalArchive } from "../archive/localArchive";
import { readableRoleColor } from "./roleColor";
import { aroundCount, PRESENCE_LABELS, presenceKeyFor } from "../connection/presence";
import { canInChannel, canOnServer } from "../connection/permissions";
import { uploadGroupPicture } from "../connection/groupPicture";
import { getServerHttpBase } from "../servers/address";
import { type Status } from "./data";
import { DmInfoSheet } from "./DmInfoSheet";
import { DiscordImportSheet } from "../import/DiscordImportSheet";
import { useAllConversations } from "../connection/AllConversationsProvider";
import { fakeDmsOn } from "../dev/fakeDms";
import { GroupDialog } from "./GroupDialog";
import { GroupFace } from "./GroupFace";
import { statusColor } from "./MessagesScreen";
import { messageCards } from "../chat/cardData";
import { draftFor, draftKeyFor, keepDraft } from "../chat/drafts";
import { MessageActions } from "../chat/MessageActions";
import { PinsDrawer } from "../chat/PinsDrawer";
import { presenceDotColor } from "./MembersDrawer";
import { ReplyStub } from "../chat/Reactions";
import { ReactionPeople } from "../chat/ReactionPeople";
import { ReactionsBar } from "../chat/ReactionsBar";
import { EmojiPicker } from "../chat/EmojiPicker";
import { FormatBar } from "../chat/FormatBar";
import { parseLiveMarkdown } from "../chat/liveMarkdown";
import { GRYT_FONTS } from "../ui/fonts";
// Not the package index: it pulls in expensify-common, which this app does not install.
import MarkdownTextInput from "@expensify/react-native-live-markdown/src/MarkdownTextInput";
import {
  abilitiesFor,
  quoteOf,
  summariseReactions,
  type MessageAbilities,
} from "../chat/messageAbilities";
import { useAppearance, type MessageLayout, type OwnMessageSide } from "../preferences/appearance";
import { pickNotificationLevel } from "../preferences/pickNotificationLevel";
import { inheritedChannelLevel } from "../notify/notificationPrefs";
import { readConversation } from "../connection/unread";
import { ChannelSheet } from "./ChannelSheet";
import { useShell } from "./ShellContext";
import { UnreadPill } from "./UnreadPill";
import { ServerIcon } from "../servers/ServerIcon";
import type { JoinedServer } from "../servers/store";
import { useTabBarSpace } from "./TabBar";
import { useTwoPane } from "./twoPane";
import { friendAction, useFriendState } from "../connection/friendsStore";
import { friendHeaderSteps, type FriendHeaderStep } from "../connection/friendHeaderSteps";
import { PersonAvatar } from "../avatar/PersonAvatar";
import { Attachments } from "../chat/Attachments";
import { LinkEmbeds } from "../chat/LinkEmbeds";
import { WebhookCards } from "../chat/WebhookCards";
import { extractUrls } from "../chat/linkPreview";
import { CollapsibleText } from "../chat/CollapsibleText";
import { MessageMarkdown } from "../chat/MessageMarkdown";
import { NameTag } from "../chat/NameTag";
import { Suggestions } from "../chat/Suggestions";
import { MemberCardModal } from "../card/MemberCardModal";
import { clipboardHasImage, pastedImage } from "../chat/pasteImage";
import { SwipeToReply } from "../chat/SwipeToReply";
import { canReplyTo } from "../chat/replyable";
import { useCanStartDm, useOpenDm } from "./openDm";
import { linkTaggedMentions, pickableNames } from "../chat/taggedMentions";
import { complete, justClosedShortcode, queryAt, type Query } from "../chat/autocomplete";
import { unicodeFor } from "../chat/emoji";
import { blocksText, parseMarkdown } from "../chat/markdown";
import { avatarSource } from "../chat/files";
import { StagedAttachments } from "../chat/StagedAttachments";
import { MAX_ATTACHMENTS, pickedFrom, type Picked } from "../chat/staging";
import { TypingLine } from "../chat/TypingLine";
import { uploadAttachment } from "../chat/upload";
import { useTyping } from "../chat/useTyping";
import { shortChannelName } from "../chat/channelName";
import { isSystemMessage, resolveMentions } from "../chat/system";
import { MentionReaderContext, useMentionReader, type MentionReader } from "../chat/mentionReader";
import { plainMentionTokens } from "../chat/mentionTokens";
import { editDraft, restoreMentions, type EditDraft } from "../chat/editMentions";
import { useSuppressEveryone } from "../notify/suppressEveryone";
import type { LocalMessage } from "../connection/outbox";
import type { ConnectionState, Member } from "../connection/types";
import { type PeerPin, sealAttachment, type SealedAttachmentKey } from "@gryt/crypto";

import { forgetSealedAttachments } from "../chat/sealedAttachments";
import { sealedPlaceholder } from "../chat/sealedText";
import { sealingNotice } from "../chat/sealingNotice";
import { useConversationSealing } from "../connection/useConversationSealing";
import { useMessages } from "../connection/useMessages";
import { useMlsReportsTaken } from "../mls/capability";
import { LocalHistoryProblem } from "../mls/LocalHistoryProblem";
import { dmComposer, mergeTimeline, mlsNotice, mlsReportCopy } from "../mls/timeline";
import { useMlsConversation } from "../mls/useMlsConversation";
import { adoptThisPhonesKey } from "../mls/useServerMls";
import { useRecents } from "../share/RecentsProvider";
import { termsGate } from "../terms/termsGate";
import { groupMessages, type Row } from "./messageGroups";

import { threadMentionsIn } from "../connection/mentions";
import { deleteWithThread, threadActionFor, threadLine } from "../threads/RepliesLine";
import { useThreadUnread } from "../threads/threadUnread";
import { useActionSheet, useConfirm } from "../ui/actionSheet";
import { massMentionPrompt } from "../chat/massMention";
import { openThread } from "../threads/openThread";
import { useThreadSummaries } from "../threads/useThreadSummaries";
import { NewDivider, useJumpToUnread } from "./JumpToUnread";
import { ForumChannel } from "../threads/ForumChannel";
import { returnToTabs } from "./returnToTabs";
import { Poll } from "../chat/Poll";
import { drawsText, isUnknownKind, unknownKindNotice } from "../chat/kinds";
import { PollSheet } from "../chat/PollSheet";
import type { NewPoll } from "../chat/polls";
import { ShieldCheckIcon } from "phosphor-react-native/src/icons/ShieldCheck";
import { ShieldSlashIcon } from "phosphor-react-native/src/icons/ShieldSlash";
import { PinnedMessagesIcon } from "../ui/PinnedMessagesIcon";
import { reportToast } from "../chat/reportToast";
import { COMPATIBLE_PHOTOS } from "../chat/photoPicker";

/** A row's list key: a draft's nonce, carried to the server's copy, so sending doesn't remount it. */
const rowKey = (row: Row) => row.message.key ?? row.message.message_id;
/** How near the newest message counts as reading it, so a new one is followed. As on desktop. */
const NEAR_BOTTOM = 120;
/** How many screens above the newest message before "Jump to present" shows (GRYT-1691). */
const FAR_SCREENS = 2;
/** How long the New line stays once you're back at the newest message. */
const LINE_READ_MS = 3000;
const ROW_FADE = FadeIn.duration(160);

/**
 * A text channel: what has been said in it. **The list is inverted**, so
 * `loadOlder` hangs off `onEndReached` — the "end" is the top.
 */

/** A bubble's padding, the same on every side so the edge round a picture is even. */
const BUBBLE_PAD = 10;
const BODY_SIZE = {
  system: { fontSize: 14, lineHeight: 19 },
  compact: { fontSize: 16.5, lineHeight: 25 },
  normal: { fontSize: 16, lineHeight: 22 },
};

const sizeKey = (compact: boolean) => (compact ? "compact" : "normal");

function messageText(placeholder: string | null, fallback: boolean, text: string | null | undefined, system: boolean) {
  if (placeholder) return placeholder;
  if (fallback) return null;
  return text && system ? resolveMentions(text) : text;
}

function replyAuthor(parent: Parameters<typeof isSystemMessage>[0] | null | undefined): string {
  if (!parent) return "Someone";
  return isSystemMessage(parent) ? "System" : parent.sender_nickname || parent.sender_server_id;
}

function pressFill(pressed: boolean, theme: ReturnType<typeof useTheme>, resting: string): string {
  return pressed ? theme.color.surfaceHover : resting;
}

/**
 * Back to the channel list. canGoBack first: from a notification, or after the tablet layout
 * swapped the list for a channel on rotating, nothing is behind it and back() does nothing.
 */
function leaveChannel() {
  if (router.canGoBack()) router.back();
  else returnToTabs();
}

export function ChannelScreen() {
  const theme = useTheme();
  const { id, at } = useLocalSearchParams<{ id: string; at?: string }>();
  const { state, socket, me, getAccessToken, online } = useServerConnection();
  const { mentions, markMentionsRead, byHost, threadMentions } = useConnections();
  /* Attachments are served by the server this channel belongs to, so the row
   * needs its address to build a URL. */
  const { server, setServer } = useShell();
  const host = server?.host ?? "";

  /*
   * Reading a conversation clears the mentions in it, less those inside threads.
   * Watches the count, so one landing while the screen is open clears too.
   */
  const unseenHere = host
    ? (mentions[host]?.[id ?? ""] ?? 0) - threadMentionsIn(threadMentions, host, id ?? "")
    : 0;
  useEffect(() => {
    if (!host || !id || unseenHere <= 0) return;
    markMentionsRead(host, id);
  }, [host, id, unseenHere, markMentionsRead]);

  /* Who `@somebody` could be, worked out once for the whole list rather than
   * per row. Sorting is `applyMentions`'s job; this is only the names. */
  const { record } = useRecents();

  const { all, byId: membersById, keyStates } = useMembers();
  const mentionable = useMemo(
    () => all.map((member) => member.nickname).filter((name): name is string => Boolean(name)),
    [all],
  );

  const channel =
    state.status === "ready" ? state.channels.find((c) => c.id === id) : undefined;
  // A forum lists topics instead, so it asks for no timeline.
  const isForum = channel?.layout === "forum";

  /**
   * The direct message being read, when this id is one. A DM reuses this
   * screen; what differs is the name, which is not in `state.channels`.
   */
  const { conversations: directConversations, loaded: directsLoaded, updateGroup, addToGroup, leaveGroup } = useDirectMessages();
  const [infoOpen, setInfoOpen] = useState(false);
  const [groupSettings, setGroupSettings] = useState(false);
  // The dummy conversations only exist on the Messages tab, so in that mode they're found there.
  const fakeEntries = useAllConversations();
  const direct = directConversations.find((c) => c.conversation_id === id)
    ?? (fakeDmsOn ? fakeEntries.find((e) => e.conversation.conversation_id === id)?.conversation : undefined);
  const isDirect = Boolean(direct);

  /** The header's presence, off the members drawer's own map. Nobody in it
      draws nothing, rather than guessing offline (GRYT-1467). */
  const headerPresence = useMemo(() => {
    if (!direct) return null;
    if (direct.kind === "dm") {
      const member = membersById.get(direct.other.server_user_id);
      return member ? { kind: "one" as const, member } : null;
    }
    const known = direct.members
      .map((m) => membersById.get(m.server_user_id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
    if (known.length === 0) return null;
    return { kind: "group" as const, ...aroundCount(known) };
  }, [direct, membersById]);

  /**
   * Leave when the conversation stops existing for this person: a channel denied
   * `read_messages` drops out of `state.channels` as a deleted one does.
   */
  const gone = conversationIsGone({
    status: state.status,
    conversationId: id,
    channelIds: state.status === "ready" ? state.channels.map((c) => c.id) : [],
    directConversationIds: [...directConversations.map((c) => c.conversation_id), ...(fakeDmsOn && direct ? [direct.conversation_id] : [])],
    directsLoaded,
  });

  useEffect(() => {
    if (gone) leaveChannel();
  }, [gone]);
  const title = channel?.name ?? direct?.other.nickname ?? id ?? "";

  /**
   * Whether this conversation is encrypted, and the two operations. `members` is
   * null for a channel, which is why `decision` comes back plaintext (GRYT-729).
   */
  const sealing = useConversationSealing({
    host,
    conversationId: id ?? null,
    myServerUserId: me?.serverUserId ?? null,
    members: direct?.members ?? null,
  });

  /**
   * Drop the decrypted attachments when this conversation goes away. They are
   * plaintext copies in this app's cache (GRYT-761).
   */
  useEffect(() => () => forgetSealedAttachments(), [id]);

  const notice = useMemo(
    () =>
      sealingNotice(
        sealing.decision,
        (memberId) =>
          direct?.members.find((m) => m.server_user_id === memberId)?.nickname,
      ),
    [sealing.decision, direct],
  );

  /* A one-to-one DM goes on MLS once the other person has an MLS device (decision 4).
     Old messages still open through `sealing`, and MLS ones come from this phone. */
  const peerId = direct?.kind === "dm" ? direct.other.server_user_id : null;
  const mls = useMlsConversation({
    host,
    conversationId: id ?? null,
    peer: peerId,
    me,
    nameFor: (uid) =>
      uid === me?.serverUserId ? me?.nickname : direct?.members.find((m) => m.server_user_id === uid)?.nickname,
  });
  const peerDecision = peerId ? keyStates[peerId]?.decision : undefined;
  const changedKey = peerDecision?.kind === "changed" ? peerDecision : null;
  const [trustedPin, setTrustedPin] = useState<PeerPin | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const mlsSource = useMlsSource(host);
  const composer = dmComposer({
    dmPeer: peerId,
    mode: mls.mode,
    waiting: mls.waiting,
    archiveFailed: mls.archiveFailed,
    peerKeyChanged: !!changedKey,
  });
  const onMls = composer.path === "mls";
  const signedIn = useGrytAccount().state.status === "signedIn";
  const mlsLine = peerId
    ? mlsNotice(mls.mode, mls.problems, mls.lostHistory, direct?.other.nickname ?? "They", signedIn)
    : null;

  const toast = useToast();
  const present = useActionSheet();

  const threadUnread = useThreadUnread();
  const threads = useThreadSummaries(socket, isDirect || isForum ? null : (id ?? null), {
    getAccessToken,
    onOpen: openThread,
    onRefused: (message) => toast.show({ title: message }),
  });

  const {
    messages: serverMessages,
    hasMore: serverHasMore,
    loading,
    loadingMore,
    error,
    loadOlder: loadOlderFromServer,
    send,
    retry: retryOnServer,
    discard: discardOnServer,
    react: reactOnServer,
    edit: editOnServer,
    remove: removeOnServer,
    pin: pinOnServer,
    vote: voteOnServer,
    report: reportOnServer,
    detached,
    loadingNewer,
    loadNewer,
    openAt,
    returnToPresent,
    pages,
  } = useMessages(socket, isForum ? null : (id ?? null), {
    getAccessToken,
    me,
    seal: sealing.seal,
    open: sealing.open,
    openFile: sealing.openFile,
    host,
    /* A toast rather than a screen. Reporting is one tap and the answer is one
       line; anything larger reads as having started a process. */
    onReported: (outcome, message) =>
      toast.show(
        reportToast(outcome, message),
      ),
  });

  const messages = useMemo(
    () =>
      peerId
        ? mergeTimeline({
            server: serverMessages,
            serverHasMore,
            archived: mls.rows,
            archiveHasMore: mls.hasMore,
          })
        : serverMessages,
    [peerId, serverMessages, serverHasMore, mls.rows, mls.hasMore],
  );
  const loadOlder = useCallback(() => {
    loadOlderFromServer();
    mls.loadOlder();
  }, [loadOlderFromServer, mls.loadOlder]);
  const isMlsDraft = (nonce: string) => mls.rows.some((m) => m.nonce === nonce);
  const retry = (nonce: string) => (isMlsDraft(nonce) ? mls.retry(nonce) : retryOnServer(nonce));
  const discard = (nonce: string) => (isMlsDraft(nonce) ? mls.discard(nonce) : discardOnServer(nonce));

  const typing = useTyping(socket, id ?? null, me?.serverUserId ?? null);
  const [pollOpen, setPollOpen] = useState(false);
  const postPoll = async (poll: NewPoll) => {
    const accessToken = await getAccessToken();
    if (socket && accessToken && id) socket.emit("chat:send", { conversationId: id, accessToken, poll });
  };

  /* What a mention hits, what a #channel is called, and what @ and # offer. An
     older server has no Mention everyone, so it offers neither @everyone nor roles. */
  const suppressEveryone = useSuppressEveryone(host);
  const details = state.status === "ready" ? state.details : undefined;
  const channels = state.status === "ready" ? state.channels : undefined;
  const reader = useMemo<MentionReader>(
    () => ({
      meId: me?.serverUserId ?? null,
      roleIds: details?.role_ids ?? (details?.role ? [details.role] : []),
      suppressEveryone,
      massAllowed: !isDirect,
      roles: new Map((details?.roles ?? []).map((r) => [r.id, { name: r.name ?? r.id, color: r.color ?? null }])),
      channelName: (channelId, onHost) => {
        const conn = !onHost || onHost === host ? null : byHost[onHost];
        const connChannels = conn?.state.status === "ready" ? conn.state.channels : [];
        const list = conn ? connChannels : (channels ?? []);
        return list.find((c) => c.id === channelId)?.name ?? null;
      },
      openChannel: (channelId, onHost) => {
        if (onHost && onHost !== host) {
          if (!byHost[onHost]) return;
          setServer(onHost);
        }
        router.push({ pathname: "/channel/[id]", params: { id: channelId } });
      },
    }),
    [me?.serverUserId, details, suppressEveryone, isDirect, byHost, host, channels, setServer],
  );
  const mayMentionEveryone =
    !isDirect &&
    !!details?.permission_catalogue?.includes("mention_everyone") &&
    !!channel?.myPermissions?.includes("mention_everyone");
  const composerPeople = useMemo(() => {
    if (isDirect || !details?.permission_catalogue?.includes("mention_everyone")) return mentionable;
    const roles = (details.roles ?? [])
      .filter((r) => mayMentionEveryone || r.mentionable)
      .map((r) => r.name ?? r.id);
    return [...mentionable, ...(mayMentionEveryone ? ["everyone", "here"] : []), ...roles];
  }, [isDirect, details, mayMentionEveryone, mentionable]);
  const composerChannels = useMemo(() => (channels ?? []).map((c) => c.name), [channels]);
  /* This channel's answer, or the server-wide one in a DM or on an older server. */
  const mayHere = useCallback(
    (permission: string) => canInChannel(channel, (p) => canOnServer(details, p), permission),
    [channel, details],
  );
  const mayPost = mayHere("send_messages") && !channel?.automated;
  const offersPolls = !isDirect && mayPost && details?.polls === true;
  const mayReact = mayHere("add_reactions");
  const showsPreviews = mayHere("use_link_previews");
  const { messageLayout, ownMessageSide } = useAppearance();

  /**
   * The message being held, answered and changed. Three ids rather than three
   * messages: a message is replaced in place when the server echoes an edit.
   */
  const [held, setHeld] = useState<string | null>(null);
  // The picker opens after the menu has gone, by which time `held` is null.
  const lastHeld = useRef<string | null>(null);
  if (held) lastHeld.current = held;
  const [heldY, setHeldY] = useState<number | undefined>(undefined);
  /** Which message the full emoji picker would react to, or null while it is shut. */
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  // Whose card a tapped picture opened (GRYT-1630).
  const [cardFor, setCardFor] = useState<string | null>(null);
  const canStartDm = useCanStartDm();
  const openDmWith = useOpenDm();
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [infoOpenChannel, setInfoOpenChannel] = useState(false);

  const byId = useMemo(() => new Map(messages.map((m) => [m.message_id, m])), [messages]);
  const heldMessage = held ? byId.get(held) : undefined;
  const pickedFor = pickerFor ? byId.get(pickerFor) : undefined;
  const heldAbilities: MessageAbilities = heldMessage
    ? abilitiesFor(heldMessage, me?.serverUserId ?? null, isSystemMessage(heldMessage), (p) => (p === "send_messages" ? mayPost : mayHere(p)))
    : { canReply: false, canReact: false, canEdit: false, canDelete: false, canCopy: false, canReport: false };
  // Reporting an MLS message sends this phone's copy, once the server takes one (GRYT-1557).
  const mlsReportsTaken = useMlsReportsTaken(host);
  const abilities = heldMessage?.mls && !mlsReportsTaken ? { ...heldAbilities, canReport: false } : heldAbilities;
  // The server has no copy of an MLS message, so reactions go over MLS (GRYT-1524).
  const react = (messageId: string, src: string) =>
    byId.get(messageId)?.mls ? mls.react(messageId, src) : reactOnServer(messageId, src);
  const report = (messageId: string) => {
    const message = byId.get(messageId);
    if (message?.mls) reportOnServer(messageId, mlsReportCopy(message));
    else reportOnServer(messageId);
  };
  const edit = (messageId: string, text: string) =>
    byId.get(messageId)?.mls ? mls.edit(messageId, text) : editOnServer(messageId, text);
  const remove = (messageId: string) =>
    byId.get(messageId)?.mls ? mls.remove(messageId) : removeOnServer(messageId);
  /* The server's rule: manage_messages in a channel, anyone in a DM. An MLS message
     has no server copy to mark. */
  const pinAction =
    heldMessage && !heldMessage.mls && heldMessage.message_id && !heldMessage.pending && !heldMessage.failed &&
    !heldMessage.message_id.startsWith("pending:") && (isDirect || mayHere("manage_messages"))
      ? { pinned: Boolean(heldMessage.pinned_at), run: () => pinOnServer(heldMessage.message_id, !heldMessage.pinned_at) }
      : undefined;

  /* Dropped when the channel changes. A reply target from the channel you just
   * left would be sent to this one, where the server does not have it. */
  useEffect(() => {
    setHeld(null);
    setReplyTo(null);
    setEditing(null);
  }, [id]);

  // Newest first for an inverted list, so the array is reversed rather than the
  // grouping — which reads neighbours and has to see them in time order.
  const rows = useMemo(() => groupMessages(messages).reverse(), [messages]);
  const listRef = useRef<FlatList<Row>>(null);

  /* Rows that arrived since the last render, newest first, which fade in as the rest glide
     up. Not a first load, an older page or a row scrolled back into view (GRYT-1687). */
  const newestShown = useRef<{ channel: string | null; key: string | null; pages: number }>({ channel: null, key: null, pages: 0 });
  const freshKeys = useMemo(() => {
    const fresh = new Set<string>();
    const prev = newestShown.current;
    // A page of history is never news: newer pages below an old window come in this way too.
    if (prev.channel === (id ?? null) && prev.key && prev.pages === pages) {
      for (const row of rows) {
        const key = rowKey(row);
        if (key === prev.key) break;
        fresh.add(key);
      }
      if (fresh.size === rows.length) fresh.clear();
    }
    return fresh;
  }, [rows, id, pages]);
  useEffect(() => {
    newestShown.current = { channel: id ?? null, key: rows[0] ? rowKey(rows[0]) : null, pages };
  }, [rows, id, pages]);

  /* The list holds still when a row arrives, then scrolls to it natively if you were at the
     bottom or sent it. A Reanimated layout animation drew old rows under the new one. */
  const scrollOffset = useRef(0);
  const [farFromBottom, setFarFromBottom] = useState(false);
  // Messages that arrived below while scrolled up, for the count on Jump to present.
  const [newBelow, setNewBelow] = useState(0);
  // The first of them, where the New line goes until it has been on screen a few seconds.
  const [liveUnreadId, setLiveUnreadId] = useState<string | null>(null);
  const lineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopLineTimer = () => {
    if (lineTimer.current) clearTimeout(lineTimer.current);
    lineTimer.current = null;
  };
  const readLineSoon = useCallback(() => {
    if (lineTimer.current) return;
    lineTimer.current = setTimeout(() => {
      lineTimer.current = null;
      setLiveUnreadId(null);
    }, LINE_READ_MS);
  }, []);
  useEffect(() => {
    setFarFromBottom(false);
    setNewBelow(0);
    setLiveUnreadId(null);
    stopLineTimer();
  }, [id]);
  useEffect(() => stopLineTimer, []);
  useEffect(() => {
    if (freshKeys.size === 0 || detached) return;
    const mine = rows.some((r) => freshKeys.has(rowKey(r)) && r.message.pending);
    if (scrollOffset.current > NEAR_BOTTOM && !mine) {
      setNewBelow((n) => n + freshKeys.size);
      const oldest = [...rows].reverse().find((r) => freshKeys.has(rowKey(r)));
      if (oldest) setLiveUnreadId((line) => line ?? oldest.message.message_id);
      stopLineTimer();
      return;
    }
    const frame = requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [freshKeys, rows, detached]);
  const unreadJump = useJumpToUnread(host, id ?? null, rows, me?.serverUserId ?? null, listRef);

  /* A pin or reply quote: scrolled to when loaded, else history opens at it (GRYT-1686).
     The scroll waits for the render that has the row. */
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);
  // The message a jump landed on, lit for a moment so the eye finds it (C08).
  const [flashed, setFlashed] = useState<string | null>(null);
  const jumpTo = useCallback(
    (messageId: string) => {
      if (rows.some((r) => r.message.message_id === messageId)) return setJumpTarget(messageId);
      void openAt(messageId).then((result) => {
        if (result === "window") setJumpTarget(messageId);
        else if (result === "missing") toast.show({ title: "That message isn't there any more" });
        else toast.show({ title: "That message is further back than what's loaded" });
      });
    },
    [rows, openAt, toast],
  );
  useEffect(() => {
    if (!jumpTarget) return;
    const index = rows.findIndex((r) => r.message.message_id === jumpTarget);
    if (index < 0) return;
    // Cleared inside the frame: clearing first re-runs this and cancels the scroll.
    const frame = requestAnimationFrame(() => {
      setJumpTarget(null);
      setFlashed(jumpTarget);
      listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [jumpTarget, rows]);
  // Opened at a message (a search result, a push): jump there once, when the rows exist.
  const jumpedTo = useRef<string | null>(null);
  useEffect(() => {
    if (!at || jumpedTo.current === at || rows.length === 0) return;
    jumpedTo.current = at;
    jumpTo(at);
  }, [at, rows.length, jumpTo]);
  useEffect(() => {
    if (!flashed) return;
    const timer = setTimeout(() => setFlashed(null), 1600);
    return () => clearTimeout(timer);
  }, [flashed]);

  /* A thread hangs off a channel message the server has. Opening one needs nothing
     more; starting one needs the right to post, which the server checks too. */
  const threadAction = heldMessage && !isDirect
    ? threadActionFor(
        heldMessage,
        threads.summaries[heldMessage.message_id],
        mayPost,
        threads.start,
        threadUnread[host]?.[threads.summaries[heldMessage.message_id]?.thread_id ?? ""]?.count,
      )
    : undefined;

  if (isForum && channel) {
    return (
      <ForumChannel
        channel={channel}
        header={(newTopic) => <Header name={title} description={channel.description} forum action={newTopic} />}
        notice={<ConnectionNotice state={state} online={online} />}
        mayPost={mayPost}
      />
    );
  }

  const screen = (
    <KeyboardAvoidingView
      // Android resizes the window itself, and adding padding on top of that
      // moves the composer twice as far as the keyboard.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: theme.color.bg }}
    >
      {isDirect && direct && host ? (
        <DirectHeader
          conversation={direct}
          host={host}
          serverName={server?.name ?? host}
          status={direct.kind === "dm" ? (membersById.get(direct.other.server_user_id)?.status as Status | undefined) : undefined}
          encrypted={mls.mode ? mls.mode.kind !== "refused" : null}
          onOpenInfo={() => setInfoOpen(true)}
        />
      ) : null}
      {isDirect && direct && host ? null : <Header
        name={title}
        automated={channel?.automated}
        description={isDirect ? undefined : channel?.description}
        isDirect={isDirect}
        peerId={direct?.kind === "dm" ? direct.other.server_user_id : null}
        conversationId={isDirect ? (id ?? null) : null}
        server={isDirect ? server : null}
        presence={headerPresence}
        onOpenPins={() => setPinsOpen(true)}
        onOpenInfo={isDirect ? undefined : () => setInfoOpenChannel(true)}
      />}

      <ConnectionNotice state={state} online={online} />
      {unreadJump.pill}

      {loading && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Spinner color={theme.color.muted} />
        </View>
      )}
      {!loading && !!error && <Centered text={error} tone="danger" />}
      {!loading && !error && rows.length === 0 && (
        isDirect && direct ? (
          <DirectMessageWelcome
            nickname={direct.other.nickname}
            avatarUrl={
              host && direct.other.avatar_file_id
                ? avatarSource(host, direct.other.avatar_file_id)
                : null
            }
            serverName={server?.name ?? null}
          />
        ) : (
          <Centered text="No messages yet. Say something." />
        )
      )}
      {!loading && !error && rows.length > 0 && (
        <FlatList
          ref={listRef}
          inverted
          data={rows}
          {...unreadJump.listProps}
          keyExtractor={rowKey}
          extraData={flashed}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onScroll={(e) => {
            scrollOffset.current = e.nativeEvent.contentOffset.y;
            // Inverted, so the offset is the distance from the newest message (GRYT-1691).
            const far = e.nativeEvent.contentOffset.y > e.nativeEvent.layoutMeasurement.height * FAR_SCREENS;
            setFarFromBottom((prev) => (prev === far ? prev : far));
            if (e.nativeEvent.contentOffset.y <= NEAR_BOTTOM) {
              setNewBelow((n) => (n === 0 ? n : 0));
              readLineSoon();
            }
          }}
          scrollEventThrottle={32}
          renderItem={({ item }) => (
            <Animated.View entering={freshKeys.has(rowKey(item)) ? ROW_FADE : undefined}>
            <SwipeToReply
              enabled={mayPost && canReplyTo(item.message)}
              onReply={() => {
                setEditing(null);
                setReplyTo(item.message.message_id);
              }}
            >
            <MessageRow
              row={item}
              firstUnread={item.message.message_id === (unreadJump.firstUnreadId ?? liveUnreadId)}
              flashed={item.message.message_id === flashed}
              host={host}
              mentionable={mentionable}
              layout={messageLayout}
              ownSide={ownMessageSide}
              me={me?.serverUserId ?? null}
              parent={
                item.message.reply_to_message_id
                  ? byId.get(item.message.reply_to_message_id)
                  : undefined
              }
              getAccessToken={getAccessToken}
              onRetry={retry}
              onDiscard={discard}
              onHold={(messageId, y) => {
                setHeld(messageId);
                setHeldY(y);
              }}
              onToggleReaction={mayReact ? react : undefined}
              onOpenPicker={mayReact ? setPickerFor : undefined}
              onVote={mayReact ? voteOnServer : undefined}
              showsPreviews={showsPreviews}
              thread={threadLine(threads.summaries[item.message.message_id], host, threadMentions, threadUnread)}
              onOpenCard={setCardFor}
              onJumpTo={jumpTo}
            />
            </SwipeToReply>
            </Animated.View>
          )}
          onEndReached={loadOlder}
          // Inverted, the start is the bottom: newer pages below an older window.
          onStartReached={detached ? loadNewer : undefined}
          onStartReachedThreshold={0.4}
          ListHeaderComponent={
            loadingNewer ? (
              <View style={{ paddingVertical: theme.space(4) }}>
                <Spinner color={theme.color.muted} />
              </View>
            ) : null
          }
          onEndReachedThreshold={0.4}
          // Dismiss on a drag rather than a tap: a tap in the list is how you
          // reach a message.
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: theme.space(4) }}>
                <Spinner color={theme.color.muted} />
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingVertical: theme.space(3) }}
        />
      )}

      {/* Above the composer and below the list, so what moves when it appears
          is the boundary between the two rather than the composer itself. */}
      {detached || farFromBottom || newBelow > 0 ? (
        // Zero height, so the pill floats over the newest messages instead of pushing them up.
        <View style={{ height: 0, zIndex: 1, elevation: 1, alignItems: "center" }}>
          <Pressable
            onPress={() => {
              if (detached) returnToPresent();
              setFarFromBottom(false);
              setNewBelow(0);
              listRef.current?.scrollToOffset({ offset: 0, animated: false });
            }}
            accessibilityRole="button"
            accessibilityLabel={newBelow > 0 ? `${newBelow} new. Jump to latest` : "Jump to latest"}
            hitSlop={6}
            style={({ pressed }) => ({
              position: "absolute",
              bottom: theme.space(2),
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space(2),
              height: 40,
              paddingHorizontal: theme.space(4),
              borderRadius: theme.radius.full,
              borderWidth: 1,
              borderColor: theme.color.border,
              backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
              shadowColor: "#000",
              shadowOpacity: 0.4,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 8 },
            })}
          >
            <ArrowDownIcon size={16} color={theme.color.text} weight="bold" />
            <Text style={{ fontSize: 14, fontWeight: "600", color: theme.color.text }}>Jump to latest</Text>
            {newBelow > 0 ? <UnreadPill count={newBelow} /> : null}
          </Pressable>
        </View>
      ) : null}

      <TypingLine typers={typing.typers} />

      {/* Whether this is going out in the open, next to the box being typed
          into (GRYT-729). The wording is in `sealingNotice` so it can be
          checked — it is the only thing that tells somebody their message is
          not private, and everything it can get wrong is quiet. */}
      {/* Instead of the line below while it's what holds the composer, with the way out. */}
      {composer.archiveProblem ? <LocalHistoryProblem compact /> : null}

      {!composer.archiveProblem && (mlsLine ?? (onMls ? null : notice)) ? (
        <Text
          accessibilityLiveRegion="polite"
          // Hidden for support (GRYT-1864): a long press copies what this phone knows about the DM.
          onLongPress={
            mlsLine && id && host
              ? () =>
                  void asSession(mlsSource)
                    ?.diagnose(id)
                    .then((d) => Clipboard.setStringAsync(JSON.stringify({ host, conversationId: id, problems: mls.problems, ...d }, null, 2)))
                    .then(() => toast.show({ title: "Copied the encryption details" }))
                    .catch(() => toast.show({ title: "Couldn't read the details" }))
              : undefined
          }
          style={{
            paddingHorizontal: theme.space(4),
            paddingBottom: theme.space(1),
            color: theme.color.muted,
            fontSize: 12,
          }}
        >
          {mlsLine ?? notice}
          {mls.problems.lost === "other_identity" ? (
            <>
              {" "}
              <Text accessibilityRole="link" style={{ textDecorationLine: "underline" }} onPress={() => router.push("/link-from-device")}>
                Link this phone
              </Text>
              {"  "}
              <Text
                accessibilityRole="link"
                style={{ textDecorationLine: "underline" }}
                onPress={() =>
                  Alert.alert(
                    "Use this phone's key for your account?",
                    "Everyone you message here will see that your key changed. Your other devices stop working for encrypted DMs here until you link them to this phone. Only do this if you can't link this phone.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Use this key",
                        style: "destructive",
                        onPress: () =>
                          void adoptThisPhonesKey(host).then((ok) => {
                            if (!ok) toast.show({ title: "Couldn't switch your key to this phone's" });
                          }),
                      },
                    ],
                  )
                }
              >
                Use this phone's key instead
              </Text>
            </>
          ) : null}
        </Text>
      ) : null}

      {host && peerId && (changedKey || trustedPin) ? (
        <KeyChangeCard
          host={host}
          memberId={peerId}
          name={direct?.other.nickname ?? "They"}
          decision={changedKey}
          trusted={trustedPin}
          onTrusted={(previous) => {
            setTrustedPin(previous);
            socket?.emit("members:fetch");
          }}
          onUndone={() => {
            setTrustedPin(null);
            socket?.emit("members:fetch");
          }}
          onSendCopy={
            mlsSource && id ? async () => shareHistory(mlsSource, (await openLocalArchive()).messages, id, peerId) : undefined
          }
        />
      ) : null}

      <PollSheet
        visible={pollOpen}
        roles={details?.roles ?? []}
        onClose={() => setPollOpen(false)}
        onPost={(poll) => void postPoll(poll)}
      />
      <Composer
        channel={title}
        isDirect={isDirect}
        channelId={id ?? ""}
        onType={typing.type}
        onStopTyping={typing.stop}
        enabled={state.status === "ready" && online && !composer.held}
        mentionable={composerPeople}
        channels={composerChannels}
        replyingTo={replyTo ? byId.get(replyTo) : undefined}
        onCancelReply={() => setReplyTo(null)}
        editing={editing ? byId.get(editing) : undefined}
        onCancelEdit={() => setEditing(null)}
        host={host}
        mayPost={mayPost}
        automated={channel?.automated}
        mayAttach={mayHere("attach_files")}
        onPoll={offersPolls ? () => setPollOpen(true) : undefined}
        getAccessToken={getAccessToken}
        // On MLS the file's key rides inside the message, sealed as a sealed DM's is (GRYT-1523).
        sealFile={onMls && id ? (bytes, about) => sealAttachment({ bytes, conversationId: id, ...about }) : sealing.sealFile}
        onSend={(text, files) => {
          if (editing) {
            edit(editing, text);
            setEditing(null);
            return;
          }
          if (onMls) mls.send(text, replyTo, files);
          else send(text, replyTo, files);
          setReplyTo(null);
          /* Where you last spoke, for the share picker. On send rather than on
           * open: opening a channel says nothing about where you would post. */
          if (id) {
            record({
              host,
              channelId: id,
              channelName: channel?.name ?? id,
              serverName: server?.name ?? host,
            });
          }
        }}
      />

      <MessageActions
        serverHost={host || undefined}
        open={held !== null}
        onOpenChange={(open) => {
          if (!open) setHeld(null);
        }}
        abilities={abilities}
        onReact={(src) => held && react(held, src)}
        onOpenPicker={() => setPickerFor(lastHeld.current)}
        onReply={() => {
          setEditing(null);
          setReplyTo(held);
        }}
        onCopy={() => {
          if (heldMessage?.text) void Clipboard.setStringAsync(heldMessage.text);
        }}
        onEdit={() => {
          setReplyTo(null);
          setEditing(held);
        }}
        onDelete={() => held && deleteWithThread(present, threads.summaries[held], () => remove(held))}
        onReport={() => held && report(held)}
        thread={threadAction}
        pin={pinAction}
        anchorY={heldY}
        preview={heldMessage ? <HeldPreview message={heldMessage} host={host} /> : undefined}
      />

      {isDirect && direct && host ? (
        <DmInfoSheet
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          host={host}
          socket={socket}
          conversation={direct}
          files={messages.flatMap((m) => m.enriched_attachments ?? []).reverse()}
          onPickPin={jumpTo}
          onEditGroup={direct.kind === "group" ? () => { setInfoOpen(false); setGroupSettings(true); } : undefined}
          onLeave={direct.kind === "group" ? () => { setInfoOpen(false); leaveGroup(direct.conversation_id); } : undefined}
          onImport={__DEV__ && direct.kind === "dm" ? () => { setInfoOpen(false); setImportOpen(true); } : undefined}
          askedBy={
            direct.kind === "dm"
            && messages.some((m) => m.imported_from && m.sender_server_id === peerId)
            && !messages.some((m) => m.imported_from && m.sender_server_id !== peerId)
              ? direct.other.nickname
              : undefined
          }
        />
      ) : null}
      {direct?.kind === "dm" && peerId ? (
        <DiscordImportSheet
          open={importOpen}
          onClose={() => setImportOpen(false)}
          peerName={direct.other.nickname}
          conversationId={direct.conversation_id}
          peer={peerId}
          source={mlsSource}
          host={host ?? ""}
          getToken={getAccessToken}
          seal={(bytes, about) => sealAttachment({ bytes, conversationId: direct.conversation_id, ...about })}
        />
      ) : null}
      {direct?.kind === "group" ? (
        <GroupDialog
          open={groupSettings}
          onOpenChange={setGroupSettings}
          host={host}
          me={me?.serverUserId ?? null}
          existing={direct}
          canAdd={canOnServer(state.status === "ready" ? state.details : undefined, "create_groups")}
          uploadImage={async (uri, filename) => {
            const accessToken = await getAccessToken();
            if (!accessToken || !host) throw new Error("Not signed in to this server");
            return uploadGroupPicture(getServerHttpBase(host), accessToken, uri, filename);
          }}
          onUpdate={updateGroup}
          onAdd={addToGroup}
          onLeave={leaveGroup}
        />
      ) : null}

      {channel && host ? (
        <ChannelSheet
          open={infoOpenChannel}
          onClose={() => setInfoOpenChannel(false)}
          name={channel.name}
          description={channel.description}
          onPins={() => setPinsOpen(true)}
          onSearch={() => router.push({ pathname: "/channel-search/[id]", params: { id: channel.id } })}
          onNotifications={() =>
            pickNotificationLevel(present, host, { kind: "channel", id: channel.id }, "Notifications", channel.name, inheritedChannelLevel(host, channel))
          }
          onMarkRead={() => readConversation(socket, host, channel.id)}
        />
      ) : null}
      <PinsDrawer
        socket={socket}
        conversationId={id ?? null}
        open={pinsOpen}
        onOpenChange={setPinsOpen}
        nameOf={(userId) => membersById.get(userId)?.nickname ?? "Someone"}
        onPick={jumpTo}
      />

      <MemberCardModal
        member={cardFor ? membersById.get(cardFor) : undefined}
        host={host}
        channelName={(() => {
          const room = cardFor ? membersById.get(cardFor)?.voiceChannelId : undefined;
          return room ? channels?.find((c) => c.id === room)?.name : undefined;
        })()}
        onClose={() => setCardFor(null)}
        onMessage={
          cardFor && canStartDm && cardFor !== me?.serverUserId && cardFor !== direct?.other.server_user_id
            ? () => {
                setCardFor(null);
                openDmWith(cardFor);
              }
            : undefined
        }
      />

      <EmojiPicker
        open={pickerFor !== null}
        onOpenChange={(open) => {
          if (!open) setPickerFor(null);
        }}
        onSelect={(src) => {
          if (pickerFor) react(pickerFor, src);
        }}
        serverHost={host}
        title={pickedFor ? `React to ${pickedFor.sender_nickname || "this message"}` : undefined}
      />
    </KeyboardAvoidingView>
  );

  return <MentionReaderContext.Provider value={reader}>{screen}</MentionReaderContext.Provider>;
}

/**
 * A thin line rather than a screen — the messages above are still worth reading.
 * **The refused and errored cases have to be here**, or somebody types into it.
 */
export function ConnectionNotice({
  state,
  online,
}: {
  state: ConnectionState;
  online: boolean;
}) {
  /* `reason` is the machine code and tells the reader nothing. The same sentence
   * the server screen leads with is what belongs here. */
  if (state.status === "refused") return <Bar tone="danger" text="This is not the same server" />;
  if (state.status === "error") return <Bar tone="danger" text={state.message} />;
  // Before the channel has ever loaded, the spinner below says this already.
  if (!online && state.status === "ready") return <Bar spinner text="Reconnecting…" />;
  return null;
}

function Bar({
  text,
  tone,
  spinner,
}: {
  text: string;
  tone?: "danger";
  spinner?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.space(2),
        paddingVertical: theme.space(2),
        paddingHorizontal: theme.space(4),
        /* `dangerLight` is a light-theme tint and reads as a pink strip on this
         * background. The colour carrying the meaning is the text. */
        backgroundColor: theme.color.surfaceRaised,
        borderBottomWidth: 1,
        borderColor: theme.color.border,
      }}
    >
      {spinner ? <Spinner size="small" color={theme.color.muted} /> : null}
      <Text
        numberOfLines={2}
        style={{
          color: tone === "danger" ? theme.color.danger : theme.color.muted,
          fontSize: 13,
          flexShrink: 1,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

/** A conversation's header (P3): face, name over "on <server> · Encrypted", call and video.
 * The face and name open the info sheet (P4). */
function DirectHeader({
  conversation,
  host,
  serverName,
  status,
  encrypted,
  onOpenInfo,
}: {
  conversation: DirectConversation;
  host: string;
  serverName: string;
  status?: Status;
  /** Null while it's still being worked out, so the line says nothing rather than guess. */
  encrypted: boolean | null;
  onOpenInfo: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { outgoing, ring, cancel } = useCalls();
  const { setVoiceChannel, setVoice } = useShell();
  const twoPane = useTwoPane();
  const id = conversation.conversation_id;
  const ringing = outgoing?.conversation_id === id;
  const title = conversationTitle(conversation);
  const group = conversation.kind === "group";

  const call = (video: boolean) => {
    if (ringing) {
      cancel(id);
      return;
    }
    ring(id);
    // Joining your own call rather than waiting to be let in; the caller is in the room from the ring.
    setVoiceChannel({ id, name: title, type: "voice" });
    if (video) setVoice({ camera: true });
  };
  const round = (label: string, onPress: () => void, icon: ReactNode, on = false) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: on ? theme.color.accent : pressFill(pressed, theme, "transparent"),
      })}
    >
      {icon}
    </Pressable>
  );

  return (
    <View
      style={{
        paddingTop: insets.top + 4,
        paddingBottom: 12,
        paddingLeft: 8,
        paddingRight: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderBottomWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: theme.color.surface,
      }}
    >
      {twoPane ? null : round("Back", leaveChannel, <CaretLeftIcon size={22} color={theme.color.accent} weight="bold" />)}
      <Pressable
        onPress={onOpenInfo}
        accessibilityRole="button"
        accessibilityLabel={group ? `${title}, group info` : `${title}'s card`}
        style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        {group ? (
          <GroupFace host={host} conversation={conversation} size={38} />
        ) : (
          <View style={{ width: 38, height: 38 }}>
            <PersonAvatar
              name={conversation.other.nickname}
              source={conversation.other.avatar_file_id ? avatarSource(host, conversation.other.avatar_file_id) : null}
              size={38}
            />
            {status ? (
              <View style={{ position: "absolute", right: -2, bottom: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: theme.color.surface, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: statusColor(theme, status) }} />
              </View>
            ) : null}
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 17, fontWeight: "700" }}>{title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 12, flexShrink: 1 }}>
              {group ? `${conversation.members.length + 1} people \u00b7 ${serverName}` : `on ${serverName}`}
              {encrypted === null ? "" : " \u00b7 "}
            </Text>
            {encrypted === null ? null : (
              <>
                {encrypted
                  ? <ShieldCheckIcon size={11} weight="fill" color={theme.color.muted} />
                  : <ShieldSlashIcon size={11} weight="fill" color={theme.color.danger} />}
                <Text style={{ color: encrypted ? theme.color.muted : theme.color.danger, fontSize: 12 }}>
                  {encrypted ? "Encrypted" : "Not encrypted"}
                </Text>
              </>
            )}
          </View>
        </View>
      </Pressable>
      {round(ringing ? "Cancel the call" : "Start a call", () => call(false), ringing
        ? <PhoneDisconnectIcon size={20} color={theme.color.onAccent} weight="fill" />
        : <PhoneIcon size={20} color={theme.color.text} />, ringing)}
      {ringing ? null : round("Start a video call", () => call(true), <CameraIcon size={20} color={theme.color.text} />)}
    </View>
  );
}

/** What the header names beside a direct message: one person's bucket, or how
    many of a group are around (GRYT-1467). */
type HeaderPresence =
  | { kind: "one"; member: Member }
  | { kind: "group"; present: number; total: number };

function Header({
  name,
  description,
  isDirect,
  conversationId,
  server,
  presence,
  peerId,
  onOpenPins,
  forum,
  automated,
  action,
  onOpenInfo,
}: {
  name: string;
  /** A forum channel: its own icon in the tile. */
  forum?: boolean;
  /** A bot channel: a robot in the tile. */
  automated?: boolean;
  /** Opens the channel sheet (C38). Without it, a tap shows the description. */
  onOpenInfo?: () => void;
  /** A button on the right in place of the pins, such as a forum's New topic (C19). */
  action?: ReactNode;
  /** What the channel is for, one line under its name. Tapping shows all of it. */
  description?: string;
  /** Opens the pinned messages. Absent on a forum. */
  onOpenPins?: () => void;
  isDirect?: boolean;
  /** The other person in a one-to-one, for Add friend (GRYT-1471). */
  peerId?: string | null;
  /** Set when this screen is a conversation, which is what can be called. */
  conversationId?: string | null;
  /** The server a direct message is on, drawn beside the name like the desktop's. GRYT-1341. */
  server?: JoinedServer | null;
  presence?: HeaderPresence | null;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { outgoing, ring, cancel } = useCalls();
  const { setVoiceChannel, server: here } = useShell();
  /* Beside the channel list there is nowhere to go back *to*: `router.back()`
     lands on the empty "pick a channel" pane. */
  const twoPane = useTwoPane();

  const ringing = Boolean(conversationId) && outgoing?.conversation_id === conversationId;
  const about = description?.trim() || null;
  // A channel's header sits on the page, like the Server tab's (C01). A direct message keeps its band.
  const plain = !isDirect;

  return (
    <View
      style={{
        paddingTop: insets.top + theme.space(1),
        paddingBottom: theme.space(2),
        paddingLeft: theme.space(2),
        paddingRight: theme.space(4),
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(2),
        borderBottomWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: plain ? theme.color.bg : theme.color.surface,
      }}
    >
      {twoPane ? null : (
        <Pressable
          onPress={leaveChannel}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: theme.radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressFill(pressed, theme, plain ? "transparent" : theme.color.surfaceRaised),
          })}
        >
          <CaretLeftIcon size={20} color={plain ? theme.color.accent : theme.color.text} weight="bold" />
        </Pressable>
      )}

      {plain ? (
        <Pressable
          onPress={onOpenInfo ?? (about ? () => Alert.alert(name, about) : undefined)}
          accessibilityRole={onOpenInfo || about ? "button" : undefined}
          accessibilityHint={onOpenInfo || about ? "Shows what the channel is for" : undefined}
          style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: theme.space(2.5) }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.color.surfaceRaised,
            }}
          >
            {forum ? <ChatsTeardropIcon size={16} color={theme.color.muted} weight="fill" /> : null}
            {!forum && automated ? <RobotIcon size={16} color={theme.color.muted} weight="bold" /> : null}
            {!forum && !automated ? <HashIcon size={16} color={theme.color.muted} weight="bold" /> : null}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 17, fontWeight: "700", flexShrink: 1 }}>
                {name}
              </Text>
              {onOpenInfo || about ? <CaretRightIcon size={14} color={theme.color.muted} weight="bold" /> : null}
            </View>
            {here?.name ? (
              <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 12 }}>
                {here.name}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ) : (
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {isDirect ? (
            <ChatTeardropTextIcon size={18} color={theme.color.text} weight="bold" />
          ) : (
            <HashIcon size={18} color={theme.color.text} weight="bold" />
          )}
          {/* `flex: 1` as well as `numberOfLines`. Without it the text measures
              at its full width and runs past the row rather than truncating in
              it — the ellipsis only appears once something bounds the width. */}
          <Text
            numberOfLines={1}
            style={[
              { color: theme.color.text, fontSize: 18, fontWeight: "700", minWidth: 0 },
              // Shrink rather than fill with a chip beside it, or the chip is pushed to the far end.
              server || presence ? { flexShrink: 1 } : { flex: 1 },
            ]}
          >
            {name}
          </Text>
          {presence ? <HeaderPresenceBadge presence={presence} /> : null}
          {server ? (
            <View
              accessible
              accessibilityLabel={server.name}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 8,
                paddingVertical: 2,
                marginLeft: 4,
                borderWidth: 1,
                borderColor: theme.color.border,
                borderRadius: theme.radius.full,
                // Gives way before the name does, down to the icon, its padding and its border.
                flexShrink: 1000,
                minWidth: 14 + 16 + 2,
                overflow: "hidden",
              }}
            >
              <ServerIcon host={server.host} name={server.name} size={14} style={{ borderRadius: 4 }} />
              <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 12, flexShrink: 1 }}>
                {server.name}
              </Text>
            </View>
          ) : null}
        </View>
        {about ? (
          <Pressable onPress={() => Alert.alert(name, about)} accessibilityRole="button" accessibilityHint="Shows the whole description">
            <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 13, marginLeft: 22 }}>
              {about}
            </Text>
          </Pressable>
        ) : null}
        </View>
      )}

      <FriendHeaderButton host={server?.host ?? null} serverUserId={peerId ?? null} name={name} />

      {action}
      {onOpenPins ? (
        <Pressable
          onPress={onOpenPins}
          accessibilityRole="button"
          accessibilityLabel="Pinned messages"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: theme.radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressFill(pressed, theme, plain ? "transparent" : theme.color.surfaceRaised),
          })}
        >
          <PinnedMessagesIcon size={20} color={plain ? theme.color.muted : theme.color.text} />
        </Pressable>
      ) : null}

      {/* Only a conversation. A channel is always there and you join it from
          the list rather than by calling it.

          One button for both, because during your own ring the only thing you
          want is to stop it. Starting a call and joining one already going are
          the same act — the room is the room — so this does not need to know
          whether anybody is in there. */}
      {conversationId ? (
        <Pressable
          onPress={() => {
            if (ringing) {
              cancel(conversationId);
              return;
            }
            ring(conversationId);
            /* Joining your own call rather than waiting to be let in. The
               caller is in the room from the moment it rings. */
            setVoiceChannel({ id: conversationId, name, type: "voice" });
          }}
          accessibilityRole="button"
          accessibilityLabel={ringing ? "Cancel the call" : "Start a call"}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: theme.radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: ringing ? theme.color.accent : pressFill(pressed, theme, theme.color.surfaceRaised),
          })}
        >
          {ringing ? (
            <PhoneDisconnectIcon size={20} color={theme.color.text} weight="fill" />
          ) : (
            <PhoneIcon size={20} color={theme.color.text} weight="fill" />
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

/** Icons for `friendHeaderSteps`' step.icon, by name rather than import order. */
const FRIEND_HEADER_ICONS = { add: UserPlusIcon, clock: ClockIcon, check: CheckIcon, close: XIcon };

/**
 * The next friend step with the person in a one-to-one (GRYT-1471, GRYT-1573). A
 * short label rides beside the icon now -- the name gives way first, as it already did.
 */
function FriendHeaderButton({ host, serverUserId, name }: { host: string | null; serverUserId: string | null; name: string }) {
  const theme = useTheme();
  const confirm = useConfirm();
  const state = useFriendState(host, serverUserId);
  if (!host || !serverUserId || !state) return null;
  const steps = friendHeaderSteps(state, name);
  if (steps.length === 0) return null;

  const activate = async (step: FriendHeaderStep) => {
    if (step.confirm && !(await confirm({ title: step.confirm.title, confirm: step.confirm.confirmLabel, cancel: step.confirm.cancelLabel }))) {
      return;
    }
    friendAction(host, step.action, serverUserId);
  };

  return (
    <View style={{ flexDirection: "row", gap: theme.space(1) }}>
      {steps.map((step) => {
        const Icon = FRIEND_HEADER_ICONS[step.icon];
        return (
          <Pressable
            key={step.action}
            onPress={() => activate(step)}
            accessibilityRole="button"
            accessibilityLabel={step.hint}
            hitSlop={8}
            style={({ pressed }) => ({
              height: 32,
              paddingHorizontal: 10,
              borderRadius: theme.radius.full,
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space(1),
              backgroundColor: step.accent ? theme.color.accent : pressFill(pressed, theme, theme.color.surfaceRaised),
            })}
          >
            <Icon size={16} color={theme.color.text} weight="fill" />
            <Text style={{ color: theme.color.text, fontSize: 13, fontWeight: "600" }}>{step.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The dot and word beside a DM's name — one person's bucket, or a group's headcount. */
function HeaderPresenceBadge({ presence }: { presence: HeaderPresence }) {
  const theme = useTheme();

  if (presence.kind === "group") {
    return (
      <Text
        numberOfLines={1}
        style={{ color: theme.color.muted, fontSize: 13, marginLeft: 4, flexShrink: 1 }}
      >
        {presence.present} around
      </Text>
    );
  }

  const key = presenceKeyFor(presence.member);
  return (
    <View
      accessible
      accessibilityLabel={PRESENCE_LABELS[key]}
      style={{ flexDirection: "row", alignItems: "center", gap: 5, marginLeft: 4, flexShrink: 1 }}
    >
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: theme.radius.full,
          backgroundColor: presenceDotColor(theme, presence.member),
        }}
      />
      <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 13 }}>
        {PRESENCE_LABELS[key]}
      </Text>
    </View>
  );
}

/**
 * The first thing you see in an empty direct message. **The middle line has to be
 * here**: a DM is stored by whoever runs the server.
 */
function DirectMessageWelcome({
  nickname,
  avatarUrl,
  serverName,
}: {
  nickname: string;
  avatarUrl: string | null;
  serverName: string | null;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: theme.space(8),
        gap: theme.space(3),
      }}
    >
      <PersonAvatar name={nickname} source={avatarUrl} size={64} variant="framed" />

      <Text
        numberOfLines={2}
        style={{
          color: theme.color.text,
          fontSize: 22,
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        You and {nickname}.
      </Text>

      <Text
        style={{
          color: theme.color.muted,
          fontSize: 15,
          lineHeight: 21,
          textAlign: "center",
          maxWidth: 300,
        }}
      >
        Only the two of you can read this. Whoever runs the server can too.
      </Text>

      {/* Hairline and a smaller line, so the sentence about scope reads as a
          footnote to the two above rather than a third thing of equal weight.

          A fixed width rather than `alignSelf: "stretch"` with a max. Stretch
          opts the child out of the parent's `alignItems: "center"`, so the rule
          took its width from the left edge and sat visibly off-centre under
          text that was centred. */}
      <View
        style={{
          height: 1,
          width: 220,
          marginTop: theme.space(2),
          backgroundColor: theme.color.border,
        }}
      />

      <Text
        style={{
          color: theme.color.muted,
          fontSize: 12,
          lineHeight: 18,
          textAlign: "center",
          maxWidth: 280,
          opacity: 0.85,
        }}
      >
        This conversation is on {serverName ?? "this server"}. Messaging them on another
        server starts a separate one.
      </Text>
    </View>
  );
}

export function Centered({ text, tone }: { text: string; tone?: "danger" }) {
  const theme = useTheme();
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space(8) }}
    >
      <Text
        style={{
          color: tone === "danger" ? theme.color.danger : theme.color.muted,
          fontSize: 15,
          lineHeight: 21,
          textAlign: "center",
        }}
      >
        {text}
      </Text>
    </View>
  );
}

export function MessageRow({
  row,
  firstUnread,
  flashed,
  answer,
  host,
  mentionable,
  layout,
  ownSide = "left",
  me,
  parent,
  getAccessToken,
  onRetry,
  onDiscard,
  onHold,
  onToggleReaction,
  onOpenPicker,
  onVote,
  showsPreviews,
  thread,
  onOpenCard,
  onJumpTo,
}: {
  row: Row;
  /** The first message that came in while you were away, which gets the New line. */
  firstUnread?: boolean;
  /** Just jumped to, so drawn lit for a moment. */
  flashed?: boolean;
  /** The reply that solved its topic (C22): a label over it and a green tint. */
  answer?: boolean;
  /** Where the attachments live. */
  host: string;
  /** Nicknames on this server, so `@somebody` lights up. */
  mentionable: string[];
  /** Cozy, compact or bubbles. */
  layout: MessageLayout;
  /** Which side your own messages sit on (GRYT-1723). */
  ownSide?: OwnMessageSide;
  /** Your server user id, so a reaction chip can say it is yours. */
  me: string | null;
  /** The message this one answers, when it is on the page. */
  parent: LocalMessage | undefined;
  /** Opens the message a reply quote points at, loaded or not. */
  onJumpTo?: (messageId: string) => void;
  /** Link previews are fetched through this server, so they need its token. */
  getAccessToken: () => Promise<string | null>;
  onRetry: (nonce: string) => void;
  onDiscard: (nonce: string) => void;
  /** A hold opens the actions. The row asks; it does not act. */
  onHold: (messageId: string, y?: number) => void;
  /** Absent where the channel denies reacting. */
  onToggleReaction?: (messageId: string, src: string) => void;
  /** Opens the full emoji picker for this message. Absent alongside `onToggleReaction`. */
  onOpenPicker?: (messageId: string) => void;
  /** Votes on a poll (GRYT-1732). Absent where the channel denies reacting, which voting asks for. */
  onVote?: (messageId: string, choices: number[]) => void;
  /** Off where the channel denies `use_link_previews`, so no card is fetched. */
  showsPreviews: boolean;
  /** Opens a sender's member card from their picture (GRYT-1630). Absent, the picture is inert. */
  onOpenCard?: (serverUserId: string) => void;
  /** The "N replies" line, when a thread hangs off this message. */
  thread?: ReactNode;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { message, dayLabel, showHeader, dayFromDiscord, discordEnds } = row;

  /* The server announces things in the same stream as people talk, under a sender
   * id of "system". Rendered as a person it arrives as "Unknown". */
  const system = isSystemMessage(message);

  // The nickname is added by the server and can be absent; the id is the only
  // thing always there.
  const name = system ? "System" : message.sender_nickname || message.sender_server_id;

  /* Off the message rather than out of the member list: the server puts it there
   * per message, and it is the only answer for somebody who has left. */
  const { byId: members, nameTags, avatarUrlFor } = useMembers();
  const sender = members.get(message.sender_server_id);
  const isBot = message.sender_server_id.startsWith("webhook:") || sender?.isBot === true;
  // Names are drawn in their top role's colour, as in the member list and on the desktop.
  const { state: connection } = useServerConnection();
  const senderRole = sender?.role
    ? (connection.status === "ready" ? connection.details : undefined)?.roles?.find((r) => r.id === sender.role)
    : undefined;
  const nameColor = system ? null : readableRoleColor(senderRole?.color, theme.color.surface);
  const details = connection.status === "ready" ? connection.details : undefined;
  const serverRoles = details?.roles;
  const myRoleIds = details?.role_ids ?? (details?.role ? [details.role] : []);
  const senderTag = nameTags.get(message.sender_server_id);
  // The member list says whether that file is a video, which only has a still to draw.
  const senderVideo = sender?.avatarVideo === true && sender.avatarFileId === message.sender_avatar_file_id;
  const avatarUrl =
    !system && host && message.sender_avatar_file_id
      ? avatarSource(host, message.sender_avatar_file_id, senderVideo)
      : null;

  /* `[@You](mention:user_…)` is what the server writes into a join. Unwrapped
   * before the markdown sees it, so the line reads as a sentence. */

  /* An envelope this device has not opened has no words to draw, and three of the
   * four states never will (GRYT-729). */
  const placeholder = sealedPlaceholder(message);
  /* Cards, polls and unknown kinds stand in for `text`, which is there for older apps. */
  const fallback = !drawsText(message);
  const text = messageText(placeholder, fallback, message.text, system);
  /* The words without the marks, for the label a screen reader reads out. It
   * announced the asterisks before. */
  const reader = useMentionReader();
  const spoken = text
    ? blocksText(parseMarkdown(reader ? plainMentionTokens(text, reader.channelName) : text))
    : null;

  /* Links worth drawing a card for. A sealed placeholder has none, and a system
     announcement carries a `mention:` target rather than a web address. */
  const embeddedUrls = useMemo(
    () => (placeholder || system || fallback || !showsPreviews ? [] : extractUrls(message.text)),
    [placeholder, system, fallback, showsPreviews, message.text],
  );

  const time = new Date(message.created_at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const reactions = summariseReactions(message.reactions, me);
  const [whoReacted, setWhoReacted] = useState<string | null>(null);


  /**
   * Compact drops the avatar column, so the message gets the 52pt back. That is
   * the whole difference; everything below is drawn the same way in both.
   */
  const compact = layout === "compact";
  const bubbles = layout === "bubbles";
  const own = !!me && message.sender_server_id === me;
  // Yours on the right mirrors the row: picture, name and text all move across.
  const right = own && ownSide === "right" && !system;
  const gutter = compact || (bubbles && right) ? 0 : 40 + theme.space(3);

  /* The `parent` may not be on the page: history loads a page at a time. The stub
   * still draws, saying "a message", which is true. */
  const answering = message.reply_to_message_id
    ? {
        author: replyAuthor(parent),
        quote: quoteOf(parent, reader?.channelName),
      }
    : null;

  const inBubble = bubbles && !system;
  const bodySize = BODY_SIZE[system ? "system" : sizeKey(compact)];
  const bubbleGap = bubbles ? 4 : 0;
  const listName = compact
    ? { color: nameColor ?? theme.color.text, fontSize: 12.5, fontWeight: "700" as const, letterSpacing: 0.7, textTransform: "uppercase" as const }
    : { color: nameColor ?? theme.color.text, fontSize: 16, fontWeight: "700" as const };
  const bubbleMedia = !!(message.enriched_attachments?.length || messageCards(message.cards).length || embeddedUrls.length);
  // Inside a bubble the media loses the bubble's padding on both sides.
  const mediaWidth = width - theme.space(4) * 2 - gutter - (inBubble ? BUBBLE_PAD * 2 : 0);
  const attachmentsEl = (flush: boolean) =>
    message.enriched_attachments?.length ? (
      /* Drawn, not counted — this said "1 attachment". The width is what the
         row leaves, so an image is sized before it loads. */
      <Attachments
        attachments={message.enriched_attachments}
        host={host}
        width={mediaWidth}
        flush={flush}
        title={{
          name,
          detail: new Date(message.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
        }}
      />
    ) : null;
  const { nonce, reply_to_message_id: replyTo } = message;
  const embedsEl = (flush: boolean) =>
    embeddedUrls.length ? (
      <LinkEmbeds urls={embeddedUrls} host={host} getAccessToken={getAccessToken} width={mediaWidth} flush={flush} />
    ) : null;

  const body = (
    <>
      {answer ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 }}>
          <CheckIcon size={12} color={theme.color.success} weight="bold" />
          <Text style={{ color: theme.color.success, fontSize: 12, fontWeight: "700" }}>The answer</Text>
        </View>
      ) : null}
      {answering ? (
        <ReplyStub
          author={answering.author}
          quote={answering.quote}
          onPress={onJumpTo && replyTo ? () => onJumpTo(replyTo) : undefined}
        />
      ) : null}

      {showHeader ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: right ? "flex-end" : "flex-start",
            gap: theme.space(2),
            paddingBottom: compact ? 2 : bubbleGap,
          }}
        >
          <Text
            numberOfLines={1}
            style={bubbles ? { color: nameColor ?? theme.color.muted, fontSize: 13, fontWeight: "600" } : listName}
          >
            {/* Your own bubbles on the right carry only the time, as in most messaging apps. */}
            {bubbles && right ? null : name}
            {!system && senderTag && !(bubbles && right) ? <NameTag tag={senderTag} /> : null}
          </Text>
          {isBot ? <BotTag /> : null}
          <Text
            mono={compact}
            style={{ color: theme.color.muted, fontSize: compact ? 11 : 13 }}
          >
            {time}
          </Text>
        </View>
      ) : null}

      {/* In Bubbles the whole message is one bubble: an even 10 of padding, and a radius
          of a picture's plus that, so a picture or card in its corner gets an even edge. */}
      {inBubble && (text || bubbleMedia) ? (
        <View
          style={{
            alignSelf: right ? "flex-end" : "flex-start",
            maxWidth: bubbleMedia ? undefined : "88%",
            padding: BUBBLE_PAD,
            gap: theme.space(2),
            borderRadius: theme.radius.md + BUBBLE_PAD,
            backgroundColor: own ? tint(theme.color.accent, theme.color.surfaceRaised) : theme.color.surfaceRaised,
          }}
        >
          {text ? (
            <CollapsibleText
            style={bodySize}
          >
            <MessageMarkdown
              text={text}
              mentionable={mentionable}
              style={{
                /* Muted, because an announcement is context rather than
                   conversation and should not compete with what people said. */
                color: system ? theme.color.muted : theme.color.text,
                ...bodySize,
                textAlign: right && !bubbles ? "right" : undefined,
              }}
            />
          </CollapsibleText>
          ) : null}
          {attachmentsEl(true)}
          <WebhookCards cards={message.cards} host={host} mentionable={mentionable} flush width={mediaWidth} />
          {embedsEl(true)}
        </View>
      ) : null}
      {!inBubble && text ? (
        <View>
          <CollapsibleText
            style={bodySize}
          >
            <MessageMarkdown
              text={text}
              mentionable={mentionable}
              style={{
                /* Muted, because an announcement is context rather than
                   conversation and should not compete with what people said. */
                color: system ? theme.color.muted : theme.color.text,
                ...bodySize,
                textAlign: right && !bubbles ? "right" : undefined,
              }}
            />
          </CollapsibleText>
        </View>
      ) : null}

      {/* A draft draws from the files on this phone, because the upload has only
          just started and the server has nothing to serve yet. The echo carries
          `enriched_attachments` and replaces the whole row, so this is the same
          picture twice rather than two different ones. */}
      {message.pending && message.attachments?.length ? (
        <View style={{ flexDirection: "row", gap: theme.space(2), marginTop: theme.space(1) }}>
          {message.attachments.map((uri) => (
            <Image
              key={uri}
              source={{ uri }}
              style={{
                width: 96,
                height: 96,
                borderRadius: theme.radius.md,
                backgroundColor: theme.color.surface,
              }}
              resizeMode="cover"
            />
          ))}
        </View>
      ) : null}

      {isUnknownKind(message) ? (
        <Text style={{ color: theme.color.muted, fontSize: 14, marginTop: theme.space(1), paddingVertical: theme.space(2), paddingHorizontal: theme.space(3), borderRadius: theme.radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: theme.color.border }}>
          {unknownKindNotice(message.kind ?? "")}
        </Text>
      ) : null}

      {message.poll && !isUnknownKind(message) ? (
        <Poll
          poll={message.poll}
          roleIds={myRoleIds}
          roleName={(rid) => serverRoles?.find((r) => r.id === rid)?.name ?? rid}
          nameOf={(uid) => (uid === me ? "You" : members.get(uid)?.nickname ?? "Someone")}
          onVote={onVote ? (choices) => onVote(message.message_id, choices) : undefined}
        />
      ) : null}

      {inBubble ? null : (
        <>
          {attachmentsEl(false)}
          <WebhookCards cards={message.cards} host={host} mentionable={mentionable} />
          {/* Under the attachments rather than above them: a file somebody chose to
              send outranks a card for a link they happened to mention. Same width
              as a picture, for the same reason. */}
          {embedsEl(false)}
        </>
      )}

      {message.pinned_at || message.edited_at || message.shared_by ? (
        <Text style={{ color: theme.color.muted, fontSize: 12 }}>
          {[message.pinned_at && "pinned", message.edited_at && "edited", message.shared_by && `shared by ${message.shared_by}`]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      ) : null}

      <View style={{ alignSelf: right ? "flex-end" : "flex-start" }}>
        <ReactionsBar
          reactions={reactions}
          onToggle={onToggleReaction ? (src) => onToggleReaction(message.message_id, src) : undefined}
          onShowPeople={setWhoReacted}
          onAdd={onOpenPicker ? () => onOpenPicker(message.message_id) : undefined}
        />
        <ReactionPeople
          reactions={reactions}
          shown={whoReacted}
          onClose={() => setWhoReacted(null)}
          personOf={(uid) => {
            const member = members.get(uid);
            return { name: uid === me ? "You" : member?.nickname ?? "Someone", avatar: member ? avatarUrlFor(member) : null };
          }}
        />
      </View>

      {thread}

      {message.pending && message.waiting ? (
        <Text style={{ color: theme.color.muted, fontSize: 13, paddingTop: 2 }}>Waiting for the server</Text>
      ) : null}

      {message.failed && nonce ? (
        <FailedNotice
          failure={message.failure}
          onRetry={() => onRetry(nonce)}
          onDiscard={() => onDiscard(nonce)}
        />
      ) : null}
    </>
  );

  const faceOrGap = showHeader && !system ? "face" : "gap";
  const avatarColumn = compact || (bubbles && right) ? "none" : faceOrGap;

  // An announcement is one muted line under the faces' column, as on the desktop: no name, no face.
  if (system) {
    return (
      <View>
        {dayLabel ? <DayDivider label={dayLabel} /> : null}
        {firstUnread ? <NewDivider /> : null}
        <Pressable
          onLongPress={(e) => onHold(message.message_id, e.nativeEvent.pageY)}
          accessibilityLabel={`${spoken ?? ""}, ${time}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.space(2),
            paddingLeft: theme.space(4) + gutter,
            paddingRight: theme.space(4),
            paddingVertical: theme.space(1.5),
          }}
        >
          <SignInIcon size={14} color={theme.color.muted} weight="bold" />
          <View style={{ flexShrink: 1 }}>
            {text ? <MessageMarkdown text={text} mentionable={mentionable} style={{ color: theme.color.muted, fontSize: 14 }} /> : null}
          </View>
          <Text style={{ color: theme.color.muted, fontSize: 12 }}>{time}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      {/* Above the message, in source order and on screen.
       *
       * `inverted` reverses the order cells are laid out in; it does not turn
       * each cell upside down. This was written the other way round on the
       * assumption that it did, which put "Today" under the first message of
       * the day instead of over it — visible as a heading floating in the
       * middle of a day's messages rather than starting it. */}
      {discordEnds ? <DayDivider label="Discord history ends here" /> : null}
      {dayLabel ? <DayDivider label={dayLabel} discord={dayFromDiscord} /> : null}
      {firstUnread ? <NewDivider /> : null}

      {/*
        The hold is on the row rather than on the text, so the whole message is
        the target — including an attachment, which is often the thing you want
        to reply to. `delayLongPress` is left at the platform default: a shorter
        one starts firing during a scroll.

        No `onPress`. There is nothing a tap does to a message, and a Pressable
        that responds to one by doing nothing reads as broken.
      */}
      <Pressable
        onLongPress={(e) => onHold(message.message_id, e.nativeEvent.pageY)}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${time}. ${spoken ?? (message.cards?.length ? message.text ?? "card" : "attachment")}. Hold for actions`}
        style={() => ({
          flexDirection: right ? "row-reverse" : "row",
          gap: compact ? 0 : theme.space(3),
          paddingHorizontal: theme.space(4),
          paddingTop: showHeader ? theme.space(compact ? 3 : 2) : 0,
          paddingBottom: 2,
          backgroundColor: answerOrFlash(answer, flashed, theme),
          ...(answer ? { marginHorizontal: theme.space(2), paddingHorizontal: theme.space(2), paddingBottom: theme.space(2), borderRadius: 16 } : null),
          // Greyed while the server has not confirmed it. The message is
          // readable either way — this says "not yet", not "unimportant".
          opacity: message.pending ? 0.5 : 1,
        })}
      >
        {/* Their picture, or the face seeded on the nickname. Never for the
            server: a face makes an announcement look like somebody said it. */}
        {avatarColumn === "face" && onOpenCard && sender ? (
          <Pressable
            onPress={() => onOpenCard(sender.serverUserId)}
            accessibilityRole="button"
            accessibilityLabel={`${name}, open their card`}
            hitSlop={4}
          >
            <PersonAvatar name={name} source={avatarUrl} size={40} />
          </Pressable>
        ) : null}
        {avatarColumn === "face" && !(onOpenCard && sender) && <PersonAvatar name={name} source={avatarUrl} size={40} />}
        {/* Keeps the text aligned under the block it continues. */}
        {avatarColumn === "gap" && <View style={{ width: 40 }} />}

        <View style={{ flex: 1, minWidth: 0, alignItems: right ? "flex-end" : "stretch" }}>{body}</View>
      </Pressable>
    </View>
  );
}


/**
 * What a message that did not send says for itself, on its own row rather than a
 * toast. **Discard sits next to Try again**, or the channel keeps a red mark.
 */
function FailedNotice({
  failure,
  onRetry,
  onDiscard,
}: {
  failure?: string;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: theme.space(2),
        paddingTop: 2,
      }}
    >
      <Text style={{ color: theme.color.danger, fontSize: 13 }}>
        {failure || "Not delivered."}
      </Text>
      <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8}>
        {({ pressed }) => (
          <Text
            style={{
              color: theme.color.text,
              fontSize: 13,
              fontWeight: "700",
              opacity: pressed ? 0.6 : 1,
            }}
          >
            Try again
          </Text>
        )}
      </Pressable>
      <Pressable onPress={onDiscard} accessibilityRole="button" hitSlop={8}>
        {({ pressed }) => (
          <Text style={{ color: theme.color.muted, fontSize: 13, opacity: pressed ? 0.6 : 1 }}>
            Discard
          </Text>
        )}
      </Pressable>
    </View>
  );
}

function DayDivider({ label, discord = false }: { label: string; discord?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingHorizontal: theme.space(4),
        paddingTop: theme.space(4),
        paddingBottom: theme.space(1),
      }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: theme.color.border }} />
      <Text style={{ color: theme.color.muted, fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
      {discord ? (
        <Text
          style={{
            color: theme.color.muted,
            fontSize: 11,
            fontWeight: "700",
            borderWidth: 1,
            borderColor: theme.color.border,
            borderRadius: 999,
            paddingHorizontal: 6,
          }}
        >
          Discord
        </Text>
      ) : null}
      <View style={{ flex: 1, height: 1, backgroundColor: theme.color.border }} />
    </View>
  );
}

/**
 * A rounded pill floating over the page, in the tab bar's radius language. **No
 * attach or voice-message button** — they were here with no `onPress`.
 */
export function Composer({
  channel,
  isDirect,
  channelId,
  host,
  mayPost,
  automated,
  mayAttach,
  getAccessToken,
  sealFile,
  onSend,
  onType,
  onStopTyping,
  enabled,
  mentionable,
  channels,
  replyingTo,
  onCancelReply,
  editing,
  onCancelEdit,
  placeholder,
  onPoll,
}: {
  channel: string;
  /** A person rather than a channel, so no `#` in front of the name. */
  isDirect?: boolean;
  /**
   * The id, where `channel` is the name. Both, because the name goes in the
   * placeholder and the id is what a share was addressed to.
   */
  channelId: string;
  /** Where an attachment is uploaded to. */
  host: string;
  /** Off where the channel denies `send_messages`: a line saying so takes the composer's place. */
  mayPost: boolean;
  /** Off where the channel denies `attach_files`, which takes the + away. */
  mayAttach: boolean;
  /** Offers Poll in the + menu, where this server and channel take one (GRYT-1732). */
  onPoll?: () => void;
  getAccessToken: () => Promise<string | null>;
  /**
   * Encrypt a file before upload, or null to send it as it is. **It has to give
   * the same answer as the notice above the composer** (GRYT-761).
   */
  sealFile: (
    bytes: Uint8Array,
    about?: { name?: string; mime?: string; width?: number; height?: number },
  ) => { ciphertext: Uint8Array; meta: SealedAttachmentKey } | null;
  onSend: (
    text: string,
    files?: {
      ids: string[];
      localUris: string[];
      keys?: Record<string, SealedAttachmentKey> | null;
    } | null,
  ) => void;
  /** Every change to the field. Throttled by the hook, not here. */
  onType: () => void;
  /** Anything that ends the message: sending, blurring, giving up. */
  onStopTyping: () => void;
  enabled: boolean;
  /** Who `@` can offer. */
  mentionable: string[];
  /** What `#` can offer: the channels this member can see. */
  channels: string[];
  /** The message being answered, when there is one. */
  replyingTo: LocalMessage | undefined;
  onCancelReply: () => void;
  /** The message being changed, when there is one. */
  editing: LocalMessage | undefined;
  onCancelEdit: () => void;
  /** A bot channel: the line in the composer's place says so. */
  automated?: boolean;
  /** In place of "Message #channel", such as a thread's "Reply to thread…". */
  placeholder?: string;
}) {
  const tabBarSpace = useTabBarSpace();
  const theme = useTheme();
  const { handoff, setHandoff } = useShell();
  const { all: everyone, nameTags, avatarUrlFor } = useMembers();
  const { me } = useServerConnection();
  const confirm = useConfirm();
  // A name two members share is offered once per member, tagged (GRYT-1674).
  const people = useMemo(() => pickableNames(mentionable, everyone, nameTags), [mentionable, everyone, nameTags]);
  const [text, setText] = useState("");
  /**
   * Where the caret is, which `onChangeText` does not say. `onSelectionChange`
   * fires *after* the change, so both are kept in step by recomputing on either.
   */
  const [caret, setCaret] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const input = useRef<MarkdownTextInput>(null);
  // The + menu, opened above the button like iMessage's (GRYT-1723).
  const plusRef = useRef<View>(null);
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const openAddMenu = () => {
    plusRef.current?.measureInWindow((x, y) => setAddMenu({ x, y }));
  };
  // Closed first: iOS won't present the picker while another modal is still dismissing.
  const addFrom = (from: "library" | "camera" | "files") => {
    setAddMenu(null);
    setTimeout(() => void attach(from), durations.fast + 250);
  };
  const keyboardUp = useKeyboardVisible();
  const markdownStyle = useMemo(
    () => ({
      syntax: { color: theme.color.muted },
      link: { color: theme.color.accent },
      h1: { fontSize: 20 },
      blockquote: { borderColor: theme.color.border, borderWidth: 3, marginLeft: 0, paddingLeft: 8 },
      code: { fontFamily: GRYT_FONTS.mono, fontSize: 15, color: theme.color.text, backgroundColor: theme.color.surfaceHover, borderColor: theme.color.border },
      pre: { fontFamily: GRYT_FONTS.mono, fontSize: 15, color: theme.color.text, backgroundColor: theme.color.surfaceHover, borderColor: theme.color.border },
      mentionHere: { color: theme.color.accent, backgroundColor: theme.color.surfaceHover },
    }),
    [theme],
  );
  const body = text.trim();

  const query: Query | null = useMemo(() => queryAt(text, caret), [text, caret]);

  /**
   * What a picked shortcode puts in the field: the character for a standard one.
   * A custom one stays as its shortcode — a `TextInput` cannot draw a picture.
   */
  const renderedFor = (trigger: Query["trigger"], choice: string) =>
    trigger === ":" ? (unicodeFor(choice) ?? undefined) : undefined;

  const replace = (at: { text: string; caret: number }) => {
    setText(at.text);
    setCaret(at.caret);
    /* Told to the native field as well as to state, or the caret jumps to the end
     * of the message. */
    input.current?.setSelection(at.caret, at.caret);
  };

  // Said while typing as well as asked on send: who an @everyone or @here will reach (C14).
  const pinging = !editing && mentionable.includes("everyone") ? massMentionPrompt(text, everyone, me?.serverUserId ?? null) : null;
  const [emojiOpen, setEmojiOpen] = useState(false);

  const pick = (choice: string) => {
    const current = queryAt(text, caret);
    if (!current) return;
    replace(complete(text, current, choice, renderedFor(current.trigger, choice)));
  };

  /**
   * `:tada:` typed by hand becomes 🎉 as the second colon lands. Only standard
   * names: a custom one has no character, so it stays as written.
   */
  const onChange = (next: string) => {
    /* Only while there is something there. Announcing a backspace would leave you
     * "typing" an empty message for eight seconds. */
    if (next.trim()) onType();
    else onStopTyping();

    const closed = justClosedShortcode(text, next);
    const character = closed ? unicodeFor(closed.name) : null;
    if (closed && character) {
      const replaced = next.slice(0, closed.start) + character + next.slice(closed.end);
      replace({ text: replaced, caret: closed.start + character.length });
      return;
    }
    setText(next);
  };

  /**
   * Editing loads the message into the field and focuses it. Keyed on the id: the
   * message is replaced in place whenever anybody reacts to it.
   */
  const editingId = editing?.message_id ?? null;
  const reader = useMentionReader();
  const draft = useRef<EditDraft | null>(null);
  useEffect(() => {
    draft.current = null;
    if (!editingId) return;
    draft.current = editDraft(editing?.text ?? "", reader?.channelName ?? (() => null));
    setText(draft.current.text);
    input.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  /**
   * Picked, not yet uploaded. The upload happens on send, which is what makes
   * taking one off the list free.
   */
  const [staged, setStaged] = useState<Picked[]>([]);

  /* Each conversation keeps what was typed and picked until it's sent (GRYT-1841). Read on
     arrival; what's already in the field wins, the way a share's text does. */
  const draftKey = draftKeyFor(host, channelId);
  const draftOnDisk = !isDirect;
  const draftRead = useRef(false);
  const shownKey = useRef(draftKey);
  useEffect(() => {
    draftRead.current = false;
    if (shownKey.current !== draftKey) {
      // The same field, another conversation: the last one's words were kept as they changed.
      shownKey.current = draftKey;
      setText("");
      setStaged([]);
    }
    let live = true;
    void draftFor(draftKey, draftOnDisk).then((draft) => {
      if (!live) return;
      draftRead.current = true;
      if (!draft) return;
      setText((current) => (current.trim() ? current : draft.text));
      setStaged((current) => (current.length ? current : draft.staged));
    });
    return () => {
      live = false;
    };
  }, [draftKey, draftOnDisk]);
  useEffect(() => {
    // Not before the kept one is read, or the empty field would overwrite it.
    if (!draftRead.current || editingId) return;
    keepDraft(draftKey, { text, staged }, draftOnDisk);
  }, [text, staged, draftKey, draftOnDisk, editingId]);

  const [uploading, setUploading] = useState(false);
  const [uploadProblem, setUploadProblem] = useState<string | null>(null);
  /** An image is on the clipboard, so the composer offers it (GRYT-1706). Checked when the field gets focus. */
  const [pasteOffer, setPasteOffer] = useState(false);
  const checkPaste = () => void clipboardHasImage().then(setPasteOffer);
  const paste = async () => {
    setPasteOffer(false);
    setUploadProblem(null);
    try {
      const image = await pastedImage();
      if (image) setStaged((current) => [...current, image].slice(0, MAX_ATTACHMENTS));
    } catch {
      setUploadProblem("Couldn't paste that image.");
    }
  };

  /**
   * A share from another app, staged as if typed and picked. **Taken once**, or
   * the same photo is re-staged on every render. What was in the field wins.
   */
  useEffect(() => {
    if (!handoff || handoff.channelId !== channelId) return;
    const { share } = handoff;
    setHandoff(null);
    setStaged((current) => [...current, ...share.files].slice(0, MAX_ATTACHMENTS));
    if (share.text) setText((current) => (current.trim() ? current : share.text ?? ""));
    input.current?.focus();
  }, [handoff, channelId, setHandoff]);

  const attach = async (from: "library" | "camera" | "files") => {
    setUploadProblem(null);
    if (from === "files") {
      // The Files app needs no permission: the picker hands over only what was chosen.
      const room = MAX_ATTACHMENTS - staged.length;
      if (room <= 0) return;
      // Loaded on use: a build without the native module still opens the channel.
      const DocumentPicker = await import("expo-document-picker");
      const picked = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (picked.canceled) return;
      const files = picked.assets.slice(0, room).map((asset) =>
        pickedFrom({ uri: asset.uri, fileName: asset.name, mimeType: asset.mimeType ?? "application/octet-stream" }),
      );
      setStaged((current) => [...current, ...files].slice(0, MAX_ATTACHMENTS));
      return;
    }
    const permission =
      from === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      /* The system asks once. After a refusal this is the only thing that
       * explains why the button did nothing. */
      setUploadProblem(
        from === "camera"
          ? "Camera access is off for Gryt. Turn it on in Settings."
          : "Photo access is off for Gryt. Turn it on in Settings.",
      );
      return;
    }

    const room = MAX_ATTACHMENTS - staged.length;
    if (room <= 0) return;

    const result =
      from === "camera"
        ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images", "videos"],
            allowsMultipleSelection: true,
            selectionLimit: room,
            quality: 0.9,
            ...COMPATIBLE_PHOTOS,
          });

    if (result.canceled) return;
    setStaged((current) => [...current, ...result.assets.map(pickedFrom)].slice(0, MAX_ATTACHMENTS));
  };

  const submit = async () => {
    if (!body && staged.length === 0) return;
    const ask = !editing && mentionable.includes("everyone") ? massMentionPrompt(body, everyone, me?.serverUserId ?? null) : null;
    if (ask && !(await confirm({ ...ask, confirm: "Send and notify", destructive: false }))) return;

    // Until this phone has agreed to the terms, the draft and its files stay put while it asks.
    termsGate.postAfterAgreeing(() => {
      if (staged.length > 0) {
        void sendWithFiles();
        return;
      }

      const restored = editing && draft.current ? restoreMentions(body, draft.current) : body;
      onSend(linkTaggedMentions(restored, everyone, nameTags));
      onStopTyping();
      setText("");
      setCaret(0);
      /**
       * **Emptying the state is not enough on iOS**: a held correction is re-applied
       * after the value changes. `clear()` drops it with the text.
       */
      input.current?.clear();
    });
  };

  /**
   * Upload, then send, in order — the route takes one file per request. A failure
   * stops the rest and orphans what went up, and the composer keeps its state.
   */
  const sendWithFiles = async () => {
    setUploading(true);
    setUploadProblem(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not signed in to this server.");

      const ids: string[] = [];
      const keys: Record<string, SealedAttachmentKey> = {};
      for (const file of staged) {
        const { fileId, meta } = await uploadAttachment(host, token, file, undefined, sealFile);
        ids.push(fileId);
        // Keyed by the id the server assigned, known only now. The bytes were
        // bound to a value the package chose (GRYT-761).
        if (meta) keys[fileId] = meta;
      }

      onSend(linkTaggedMentions(body, everyone, nameTags), {
        ids,
        localUris: staged.map((f) => f.uri),
        keys: Object.keys(keys).length > 0 ? keys : null,
      });
      onStopTyping();
      setText("");
      setCaret(0);
      setStaged([]);
      input.current?.clear();
    } catch (error) {
      setUploadProblem(error instanceof Error ? error.message : "That did not upload.");
    } finally {
      setUploading(false);
    }
  };

  const cancel = () => {
    if (editing) {
      onCancelEdit();
      setText("");
      input.current?.clear();
      return;
    }
    onCancelReply();
  };

  const replyContext = replyingTo && {
    label: `Replying to ${replyAuthor(replyingTo)}`,
    quote: quoteOf(replyingTo, reader?.channelName),
  };
  const context = editing ? { label: "Editing message", quote: quoteOf(editing, reader?.channelName) } : replyContext || null;

  if (!mayPost) return <ReadOnlyLine bots={automated} />;

  return (
    <>
      <View
        style={{
          gap: theme.space(2),
          paddingHorizontal: theme.space(3),
          paddingBottom: theme.space(2),
        }}
      >
        {context ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space(2),
              paddingVertical: theme.space(1.5),
              paddingLeft: theme.space(3),
              paddingRight: theme.space(1.5),
              borderRadius: 14,
              backgroundColor: theme.color.surface,
              borderWidth: 1,
              borderColor: theme.color.border,
            }}
          >
            {editing ? (
              <PencilSimpleIcon size={15} color={theme.color.accent} weight="bold" />
            ) : (
              <ArrowBendUpLeftIcon size={15} color={theme.color.accent} weight="bold" />
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: theme.color.accent, fontWeight: "600", fontSize: 13 }}>{context.label}</Text>
              {context.quote ? (
                <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 13 }}>
                  {context.quote}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={cancel}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={editing ? "Stop editing" : "Cancel reply"}
              style={({ pressed }) => ({
                width: 28,
                height: 28,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <XIcon size={15} color={theme.color.muted} weight="bold" />
            </Pressable>
          </View>
        ) : null}
        <Suggestions query={query} people={people} channels={channels} members={everyone} avatarFor={avatarUrlFor} onPick={pick} />
        {pinging ? (
          <View
            accessibilityRole="alert"
            style={{
              flexDirection: "row",
              gap: theme.space(2.5),
              paddingVertical: theme.space(2.5),
              paddingHorizontal: theme.space(3),
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.color.warning,
              backgroundColor: theme.color.surface,
            }}
          >
            <WarningIcon size={16} color={theme.color.warning} weight="bold" />
            <Text style={{ flex: 1, color: theme.color.text, fontSize: 13.5, lineHeight: 19 }}>
              <Text style={{ fontWeight: "700" }}>{pinging.title}</Text> Only send it if they all need to know.
            </Text>
          </View>
        ) : null}
        <View
          style={{
            minWidth: 0,
            borderRadius: theme.radius.xl,
            backgroundColor: theme.color.surface,
            borderWidth: 1,
            borderColor: theme.color.border,
            overflow: "hidden",
          }}
        >
          <StagedAttachments
            files={staged}
            busy={uploading}
            onRemove={(index) => {
              // The problem was about these files; with the last one gone it's about nothing.
              if (staged.length === 1) setUploadProblem(null);
              setStaged((c) => c.filter((_, i) => i !== index));
            }}
          />

          {pasteOffer && !editing && mayAttach && enabled && staged.length < MAX_ATTACHMENTS ? (
            <Pressable
              onPress={() => void paste()}
              accessibilityRole="button"
              accessibilityLabel="Paste the image from the clipboard"
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "flex-start",
                gap: theme.space(2),
                marginHorizontal: theme.space(3),
                marginTop: theme.space(2),
                paddingHorizontal: theme.space(3),
                paddingVertical: theme.space(1.5),
                borderRadius: theme.radius.full,
                backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
              })}
            >
              <ClipboardIcon size={16} color={theme.color.text} weight="bold" />
              <Text style={{ color: theme.color.text, fontSize: 13.5, fontWeight: "600" }}>Paste image</Text>
            </Pressable>
          ) : null}

          {uploadProblem ? (
            <Text
              style={{
                color: theme.color.danger,
                fontSize: 12.5,
                paddingHorizontal: theme.space(4),
                paddingTop: theme.space(2),
              }}
            >
              {uploadProblem}
            </Text>
          ) : null}

          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              gap: theme.space(1),
              paddingHorizontal: theme.space(1.5),
              paddingVertical: theme.space(1.5),
            }}
          >
                {/* Gone while editing: the server can't add a file to a message that already exists. */}
            {editing || (!mayAttach && !onPoll) ? null : (
              <Pressable
                ref={plusRef}
                onPress={openAddMenu}
                disabled={!enabled || uploading || (!onPoll && staged.length >= MAX_ATTACHMENTS)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Add a picture or a photo"
                accessibilityState={{ expanded: addMenu !== null }}
                style={({ pressed }) => ({
                  width: 36,
                  height: 36,
                  marginBottom: 0,
                  borderRadius: theme.radius.full,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: addMenu ? theme.color.surfaceHover : theme.color.surfaceRaised,
                  opacity:
                    pressed || !enabled || uploading || staged.length >= MAX_ATTACHMENTS ? 0.5 : 1,
                })}
              >
                <PlusIcon size={18} color={theme.color.text} weight="bold" />
              </Pressable>
            )}
            <MarkdownTextInput
              ref={input}
              parser={parseLiveMarkdown}
              markdownStyle={markdownStyle}
              value={text}
              onChangeText={onChange}
              onSelectionChange={(event) => {
                setCaret(event.nativeEvent.selection.start);
                setSelectionEnd(event.nativeEvent.selection.end);
              }}
              onFocus={checkPaste}
              onBlur={onStopTyping}
              editable={enabled}
              /* Shortened, because the input is `multiline`: a long name wraps
                 the placeholder. The accessibility label keeps the whole name. */
              placeholder={
                editing
                  ? "Edit your message"
                  : placeholder ?? `Message ${isDirect ? "" : "#"}${shortChannelName(channel)}`
              }
              placeholderTextColor={theme.color.muted}
              multiline
              // Return inserts a newline rather than sending: a phone keyboard has
              // one Return key and a chat message is often more than one line.
              blurOnSubmit={false}
              accessibilityLabel={
                editing ? "Edit your message" : placeholder ?? `Message ${isDirect ? "" : "#"}${channel}`
              }
              style={{
                flex: 1,
                minWidth: 0,
                color: theme.color.text,
                fontSize: 16,
                lineHeight: 21,
                /* No border of its own. The pill around it is the edge, and a
                   second one inside it reads as a field inside a field. */
                paddingHorizontal: theme.space(3),
                // `paddingVertical` on a multiline field is ignored on Android, and
                // on iOS it is the only thing that centres a single line.
                paddingTop: theme.space(2),
                paddingBottom: theme.space(2),
                // Roughly six lines before it starts scrolling instead of growing.
                maxHeight: 140,
              }}
            />

            <Pressable
              onPress={() => setEmojiOpen(true)}
              disabled={!enabled}
              accessibilityRole="button"
              accessibilityLabel="Emoji"
              hitSlop={4}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <SmileyIcon size={21} color={theme.color.muted} />
            </Pressable>
            {body || staged.length > 0 ? (
              <Pressable
                onPress={submit}
                disabled={!enabled || uploading}
                accessibilityRole="button"
                accessibilityLabel={editing ? "Save" : "Send"}
                // A small circle inside the field, as in iMessage.
                style={({ pressed }) => ({
                  width: 32,
                  height: 32,
                  marginBottom: 2,
                  borderRadius: theme.radius.full,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.color.accent,
                  opacity: pressed || !enabled ? 0.6 : 1,
                })}
              >
                {editing ? (
                  <CheckIcon size={20} color={theme.color.onAccent} weight="bold" />
                ) : (
                  <ArrowUpIcon size={18} color={theme.color.onAccent} weight="bold" />
                )}
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      {/* Over the keyboard while typing (C12), rather than only once text is selected. */}
      <FormatBar
        visible={keyboardUp && !editing}
        text={text}
        start={caret}
        end={selectionEnd}
        onApply={(edit) => {
          setText(edit.text);
          setCaret(edit.start);
          setSelectionEnd(edit.end);
          input.current?.setSelection(edit.start, edit.end);
        }}
      />

      <EmojiPicker
        open={emojiOpen}
        onOpenChange={setEmojiOpen}
        title="Emoji"
        serverHost={host || undefined}
        onPickEntry={(entry) => {
          const piece = entry.isCustom ? `:${entry.name}:` : (entry.emoji ?? "");
          if (!piece) return;
          setEmojiOpen(false);
          replace({ text: text.slice(0, caret) + piece + text.slice(caret), caret: caret + piece.length });
        }}
      />

      <Modal transparent visible={addMenu !== null} animationType="fade" onRequestClose={() => setAddMenu(null)}>
        <Pressable
          accessibilityLabel="Close"
          onPress={() => setAddMenu(null)}
          style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.35)" }}
        />
        {addMenu ? (
          <View
            accessibilityRole="menu"
            style={{
              position: "absolute",
              left: Math.max(theme.space(2), addMenu.x - theme.space(1)),
              bottom: windowHeight - addMenu.y + theme.space(2),
              width: 280,
              paddingVertical: theme.space(2),
              borderRadius: 26,
              backgroundColor: theme.color.surfaceRaised,
              borderWidth: 1,
              borderColor: theme.color.border,
            }}
          >
            {[
              ...(mayAttach && staged.length < MAX_ATTACHMENTS
                ? [
                  { key: "camera", label: "Camera", Icon: CameraIcon, from: "camera" as const },
                  { key: "photos", label: "Photos", Icon: ImageIcon, from: "library" as const },
                  { key: "files", label: "Files", Icon: FileIcon, from: "files" as const },
                ]
                : []),
              ...(onPoll ? [{ key: "poll", label: "Poll", Icon: ChartBarIcon, from: "poll" as const }] : []),
            ].map(({ key, label, Icon, from }) => (
              <Pressable
                key={key}
                onPress={() => {
                  if (from !== "poll") return addFrom(from);
                  setAddMenu(null);
                  // After the menu's own modal is gone, as with the pickers.
                  setTimeout(() => onPoll?.(), durations.fast + 250);
                }}
                accessibilityRole="menuitem"
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: theme.space(4),
                  height: 64,
                  paddingHorizontal: theme.space(5),
                  backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
                })}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: key === "photos" ? theme.color.accent : theme.color.surfaceHover,
                  }}
                >
                  <Icon size={22} color={key === "photos" ? theme.color.onAccent : theme.color.text} weight="fill" />
                </View>
                <Text style={{ color: theme.color.text, fontSize: 20 }}>{label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Modal>

      {/*
        Room for the floating tab bar, *outside* the composer's own surface.

        The bar draws over this rather than above it — the native bar it replaced
        was laid out above the content, so nothing had ever needed to reserve
        room and the composer vanished behind the new one the day it landed.

        Only while the keyboard is down. The keyboard covers the bar, so keeping
        the space open would leave a band of nothing between the field and the
        keys.
      */}
      <View pointerEvents="none" style={{ height: keyboardUp ? 0 : tabBarSpace }} />
    </>
  );
}


/** Where the composer would be, for somebody who may read a channel and not post. */
const READ_ONLY_LINE = "You can read here, but not post.";

function ReadOnlyLine({ bots = false }: { bots?: boolean }) {
  const theme = useTheme();
  const tabBarSpace = useTabBarSpace();
  const line = bots ? "Only bots post here." : READ_ONLY_LINE;

  return (
    <>
      <View
        accessible
        accessibilityLabel={line}
        style={{
          marginHorizontal: theme.space(3),
          marginBottom: theme.space(2),
          paddingHorizontal: theme.space(4),
          paddingVertical: theme.space(3),
          borderRadius: theme.radius.xl,
          borderWidth: 1,
          borderColor: theme.color.border,
          backgroundColor: theme.color.surface,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.space(2) }}>
          {bots ? <RobotIcon size={18} color={theme.color.muted} /> : null}
          <Text style={{ color: theme.color.muted, fontSize: 15, textAlign: "center" }}>{line}</Text>
        </View>
      </View>
      <View pointerEvents="none" style={{ height: tabBarSpace }} />
    </>
  );
}

/**
 * Whether the keyboard is on screen. `KeyboardAvoidingView` moves the composer and
 * says nothing about it. iOS fires before the animation; Android only has `Did`.
 */
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}

/** The accent at a fifth of its strength, for your own bubbles. A non-hex accent falls back to the surface. */
function answerOrFlash(answer: boolean | undefined, flashed: boolean | undefined, theme: ReturnType<typeof useTheme>): string {
  if (answer) return /^#[0-9a-f]{6}$/i.test(theme.color.success) ? `${theme.color.success}1f` : theme.color.surfaceHover;
  return flashed ? tint(theme.color.accent, theme.color.surfaceHover) : "transparent";
}

function tint(accent: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(accent) ? `${accent}33` : fallback;
}

/** The held message as the long-press menu shows it: face, name, time and the first lines. */
export function HeldPreview({ message, host }: { message: LocalMessage; host: string | null }) {
  const theme = useTheme();
  const system = isSystemMessage(message);
  const name = system ? "System" : message.sender_nickname || message.sender_server_id;
  const avatar = !system && host && message.sender_avatar_file_id ? avatarSource(host, message.sender_avatar_file_id) : null;
  const time = new Date(message.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return (
    <View style={{ flexDirection: "row", gap: theme.space(3) }}>
      <PersonAvatar name={name} source={avatar} size={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: theme.space(2) }}>
          <Text style={{ color: theme.color.text, fontSize: 15, fontWeight: "700" }}>{name}</Text>
          <Text style={{ color: theme.color.muted, fontSize: 12 }}>{time}</Text>
        </View>
        {message.text ? (
          <Text numberOfLines={4} style={{ color: theme.color.text, fontSize: 15, lineHeight: 21 }}>
            {message.text}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** "BOT" beside a bot's or a webhook's name, as the desktop's BotTag. */
function BotTag() {
  const theme = useTheme();
  return (
    <View style={{ alignSelf: "center", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, backgroundColor: theme.alpha.accent[2] }}>
      <Text style={{ color: theme.color.accent, fontSize: 10.5, fontWeight: "700" }}>BOT</Text>
    </View>
  );
}
