import type { ReactNode } from "react";
import { InteractionManager, Pressable } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import { ChatsTeardropIcon } from "phosphor-react-native/src/icons/ChatsTeardrop";

import type { ThreadMentionsByHost } from "../connection/mentions";
import type { LocalMessage } from "../connection/outbox";
import type { ThreadSummary } from "../connection/types";
import { Faces } from "../shell/Faces";
import { UnreadPill } from "../shell/UnreadPill";
import { useMembers } from "../connection/MembersProvider";
import type { ActionSheetOptions } from "../ui/actionSheet";
import { openThread } from "./openThread";
import { repliesLabel } from "./threads";
import type { ThreadUnreadCounts } from "./threadUnread";

/**
 * "3 replies" under a message with a thread. Accent only while something in it is new:
 * accent either way drew every line the same, which hid the one that mattered.
 */
export function RepliesLine({ thread, mentions, unread }: { thread: ThreadSummary; mentions: number; unread: number }) {
  const theme = useTheme();
  const { byId } = useMembers();
  const faces = (thread.recent_repliers ?? []).flatMap((id) => byId.get(id) ?? []);
  const color = mentions > 0 || unread > 0 ? theme.color.accent : theme.color.text;
  const label = repliesLabel(thread.reply_count);
  const last = new Date(thread.last_message_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const unreadNews = unread > 0 ? `, ${unread} new` : "";
  const news = mentions > 0 ? `, ${mentions} naming you` : unreadNews;

  return (
    <Pressable
      onPress={() => openThread(thread)}
      accessibilityRole="button"
      accessibilityLabel={`${label}${news}. Open thread`}
      hitSlop={6}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 6,
        marginTop: theme.space(2),
        paddingLeft: theme.space(2.5),
        paddingRight: theme.space(3),
        height: 32,
        borderRadius: theme.radius.full,
        borderWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surface,
      })}
    >
      {faces.length > 0 ? (
        <Faces members={faces} size={20} limit={3} ground={theme.color.surface} />
      ) : (
        <ChatsTeardropIcon size={15} color={color} weight="fill" />
      )}
      <Text style={{ color, fontSize: 13, fontWeight: "600" }}>{label}</Text>
      {Number.isNaN(Date.parse(thread.last_message_at)) ? null : (
        <Text style={{ color: theme.color.muted, fontSize: 13 }}>· {last}</Text>
      )}
      <UnreadPill count={unread} mentions={mentions} />
    </Pressable>
  );
}

/** The line for one row, or nothing when no thread hangs off it. */
export function threadLine(
  thread: ThreadSummary | undefined,
  host: string,
  mentions: ThreadMentionsByHost,
  unread: ThreadUnreadCounts,
): ReactNode {
  if (!thread) return null;
  return (
    <RepliesLine
      thread={thread}
      mentions={mentions[host]?.[thread.thread_id]?.count ?? 0}
      unread={unread[host]?.[thread.thread_id]?.count ?? 0}
    />
  );
}

/**
 * What the hold sheet offers for a thread, after Reply as on the desktop. Nothing on a
 * message the server does not have yet, or on one that is itself a reply in a thread.
 */
export function threadActionFor(
  message: LocalMessage,
  thread: ThreadSummary | undefined,
  mayPost: boolean,
  start: (rootMessageId: string) => void,
  /** Replies in it nobody has read, which beats how big it is, as on the desktop. */
  unread = 0,
): { label: string; run: () => void } | undefined {
  if (message.pending || message.failed || message.mls || message.thread_id) return undefined;
  if (message.message_id.startsWith("pending:")) return undefined;
  const run = () => start(message.message_id);
  if (thread) {
    const total = thread.reply_count ? ` (${thread.reply_count})` : "";
    const count = unread ? ` (${unread} new)` : total;
    return { label: `Open thread${count}`, run };
  }
  return mayPost ? { label: "Start thread", run } : undefined;
}

/**
 * The server deletes a root's whole thread with it, so that one delete asks first. After
 * the hold sheet has gone: iOS drops a sheet presented while another dismisses.
 */
export function deleteWithThread(
  present: (options: ActionSheetOptions) => Promise<number>,
  thread: ThreadSummary | undefined,
  run: () => void,
) {
  if (!thread?.reply_count) {
    run();
    return;
  }
  InteractionManager.runAfterInteractions(() => {
    void present({
      title: "Delete message?",
      message: `This deletes the message and the ${repliesLabel(thread.reply_count)} in its thread. You can't undo it.`,
      options: ["Delete", "Cancel"],
      destructiveButtonIndex: 0,
      cancelButtonIndex: 1,
    }).then((index) => {
      if (index === 0) run();
    });
  });
}
