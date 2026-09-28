import type { ReactNode } from "react";
import { InteractionManager, Pressable } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import { ChatsIcon } from "phosphor-react-native/src/icons/Chats";

import type { ThreadMentionsByHost } from "../connection/mentions";
import type { LocalMessage } from "../connection/outbox";
import type { ThreadSummary } from "../connection/types";
import { UnreadPill } from "../shell/UnreadPill";
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
  const color = mentions > 0 || unread > 0 ? theme.color.accent : theme.color.muted;
  const label = repliesLabel(thread.reply_count);
  const news = mentions > 0 ? `, ${mentions} naming you` : unread > 0 ? `, ${unread} new` : "";

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
        marginTop: 4,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: theme.radius.sm,
        backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
      })}
    >
      <ChatsIcon size={14} color={color} weight="fill" />
      <Text style={{ color, fontSize: 12.5, fontWeight: "700" }}>{label}</Text>
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
    const count = unread ? ` (${unread} new)` : thread.reply_count ? ` (${thread.reply_count})` : "";
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
