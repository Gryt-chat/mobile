import { useMemo, useState, type ReactNode } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Alert, Button, Chip, Spinner, Text, TextField, Toggle, useTheme } from "@gryt/ui-native";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { ChatsTeardropIcon } from "phosphor-react-native/src/icons/ChatsTeardrop";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";
import { XIcon } from "phosphor-react-native/src/icons/X";

import { useConnections, useServerConnection } from "../connection/ConnectionsProvider";
import type { Channel, ForumTag } from "../connection/types";
import { UnreadPill } from "../shell/UnreadPill";
import { useShell } from "../shell/ShellContext";
import { useTabBarSpace } from "../shell/TabBar";
import { openThread } from "./openThread";
import {
  FORUM_FILTERS,
  filterCounts,
  relativeTime,
  repliesLabel,
  shownTopics,
  toggled,
  TOPIC_BODY_MAX,
  type ForumFilter,
  type ForumTopic,
} from "./threads";
import { useForumTopics } from "./useForumTopics";
import { useThreadUnread } from "./threadUnread";
import Animated, { SlideInDown } from "react-native-reanimated";
import { useSheetInsets } from "../shell/useFold";

/**
 * A forum channel: its topics rather than a timeline, filtered the way the desktop's
 * ForumView is, and New topic where the composer would be.
 */
export function ForumChannel({
  channel,
  header,
  notice,
  mayPost,
}: {
  channel: Channel;
  /** Handed the New topic button, which sits in the header (C19). */
  header: (newTopic: ReactNode) => ReactNode;
  notice: ReactNode;
  mayPost: boolean;
}) {
  const theme = useTheme();
  const tabBarSpace = useTabBarSpace();
  const { socket, me, getAccessToken } = useServerConnection();
  const { threadMentions } = useConnections();
  const threadUnread = useThreadUnread();
  const { server } = useShell();
  const host = server?.host ?? "";
  const meId = me?.serverUserId ?? null;
  const palette = useMemo(() => channel.forumTags ?? [], [channel.forumTags]);

  const [composing, setComposing] = useState(false);
  const forum = useForumTopics(socket, channel.id, getAccessToken, () => setComposing(false));
  const [filter, setFilter] = useState<ForumFilter>("all");
  const [tags, setTags] = useState<ReadonlySet<string>>(new Set());

  const counts = useMemo(() => filterCounts(forum.topics, meId), [forum.topics, meId]);
  const shown = useMemo(() => shownTopics(forum.topics, filter, meId, tags), [forum.topics, filter, meId, tags]);
  const tagById = useMemo(() => new Map(palette.map((t) => [t.id, t])), [palette]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      {header(
        mayPost ? (
          <Pressable
            onPress={() => {
              forum.clearCreateError();
              setComposing(true);
            }}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              height: 36,
              paddingHorizontal: theme.space(3.5),
              borderRadius: theme.radius.full,
              backgroundColor: theme.color.accent,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <PlusIcon size={16} color={theme.color.onAccent} weight="bold" />
            <Text style={{ color: theme.color.onAccent, fontSize: 14, fontWeight: "600" }}>New topic</Text>
          </Pressable>
        ) : null,
      )}
      {notice}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, borderBottomWidth: 1, borderColor: theme.color.border }}
        contentContainerStyle={{ gap: theme.space(2), paddingHorizontal: theme.space(4), paddingVertical: theme.space(3) }}
      >
        {FORUM_FILTERS.map((f) => (
          <Toggle
            key={f.key}
            size="small"
            tone="neutral"
            pressed={filter === f.key}
            // There is always a filter, so pressing the one on does nothing.
            onPressedChange={() => setFilter(f.key)}
            accessibilityLabel={`${f.label}, ${counts[f.key]}`}
          >
            {`${f.label}  ${counts[f.key]}`}
          </Toggle>
        ))}
      </ScrollView>

      {palette.length > 0 ? (
        <TagRow
          palette={palette}
          picked={tags}
          onToggle={(id) => setTags((current) => toggled(current, id))}
        />
      ) : null}

      {forum.loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Spinner color={theme.color.muted} />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(t) => t.thread_id}
          renderItem={({ item }) => (
            <TopicRow
              topic={item}
              tagById={tagById}
              mentions={threadMentions[host]?.[item.thread_id]?.count ?? 0}
              unread={threadUnread[host]?.[item.thread_id]?.count ?? 0}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", gap: theme.space(2), padding: theme.space(10) }}>
              <ChatsTeardropIcon size={28} color={theme.color.muted} weight="fill" />
              <Text style={{ color: theme.color.muted, fontSize: 14, textAlign: "center" }}>
                {forum.topics.length === 0 ? "No topics yet. Start the first one." : "Nothing matches this filter."}
              </Text>
            </View>
          }
        />
      )}

      {mayPost ? null : (
        <Text style={{ color: theme.color.muted, fontSize: 15, textAlign: "center", padding: theme.space(3), paddingBottom: theme.space(3) + tabBarSpace }}>
          You can read here, but not post.
        </Text>
      )}

      <NewTopicDialog
        open={composing}
        onOpenChange={(open) => {
          if (!open) forum.clearCreateError();
          setComposing(open);
        }}
        palette={palette}
        creating={forum.creating}
        error={forum.createError}
        onCreate={forum.create}
      />
    </View>
  );
}

/** "🐛 Bug", with the tag's colour as a square swatch, as the desktop's ForumTagChip draws it. */
export function tagLabel(tag: ForumTag): string {
  return `${tag.emoji ? `${tag.emoji} ` : ""}${tag.name}`;
}

/* No theme hook in here: it is drawn inside the dialog's portal too. */
export function Swatch({ color, fallback }: { color?: string | null; fallback: string }) {
  return <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: color || fallback }} />;
}

/**
 * The channel's tag palette as a scrolling row of toggle chips. Shared by the topic
 * filter here and the thread screen's own tag editor.
 */
export function TagRow({
  palette,
  picked,
  onToggle,
}: {
  palette: ForumTag[];
  picked: ReadonlySet<string>;
  /** Absent draws the palette as labels: highlighted, but nothing to press. */
  onToggle?: (id: string) => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, borderBottomWidth: 1, borderColor: theme.color.border }}
      contentContainerStyle={{ gap: theme.space(2), paddingHorizontal: theme.space(3), paddingVertical: theme.space(2) }}
    >
      {palette.map((tag) => (
        <Toggle
          key={tag.id}
          size="xsmall"
          tone="neutral"
          pressed={picked.has(tag.id)}
          disabled={!onToggle}
          onPressedChange={onToggle ? () => onToggle(tag.id) : undefined}
          accessibilityLabel={tag.name}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Swatch color={tag.color} fallback={theme.color.accent} />
            <Text style={{ color: picked.has(tag.id) ? theme.color.text : theme.color.muted, fontSize: 12, fontWeight: "600" }}>
              {tagLabel(tag)}
            </Text>
          </View>
        </Toggle>
      ))}
    </ScrollView>
  );
}

function TopicRow({
  topic,
  tagById,
  mentions,
  unread,
}: {
  topic: ForumTopic;
  tagById: Map<string, ForumTag>;
  mentions: number;
  /** Replies nobody has read since this phone connected. */
  unread: number;
}) {
  const theme = useTheme();
  const title = topic.title || topic.preview || "Untitled topic";
  const meta = [
    topic.creator_nickname || "Someone",
    repliesLabel(topic.reply_count),
    `${topic.participant_count} ${topic.participant_count === 1 ? "participant" : "participants"}`,
    relativeTime(topic.last_message_at),
  ].join(" · ");

  const solvedBadge = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 22, paddingHorizontal: 8, borderRadius: 999, backgroundColor: theme.scales.success[3] }}>
      <CheckIcon size={12} color={theme.color.success} weight="bold" />
      <Text style={{ color: theme.color.success, fontSize: 12, fontWeight: "700" }}>Solved</Text>
    </View>
  );

  return (
    <Pressable
      onPress={() => openThread(topic)}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${meta}`}
      style={({ pressed }) => ({
        gap: 6,
        marginHorizontal: theme.space(4),
        marginTop: theme.space(2.5),
        paddingHorizontal: theme.space(4),
        paddingVertical: theme.space(3.5),
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surface,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2) }}>
        <Text numberOfLines={2} style={{ flex: 1, color: theme.color.text, fontSize: 16, fontWeight: unread + mentions > 0 ? "700" : "600" }}>
          {title}
        </Text>
        <UnreadPill count={unread} mentions={mentions} />
      </View>
      {topic.title && topic.preview ? (
        <Text numberOfLines={2} style={{ color: theme.color.muted, fontSize: 14, lineHeight: 20 }}>
          {topic.preview}
        </Text>
      ) : null}
      {topic.tags.length > 0 || topic.status !== "open" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {topic.tags.map((id) => {
            const tag = tagById.get(id);
            return tag ? <Chip key={id} label={tagLabel(tag)} tone="neutral" /> : null;
          })}
          {topic.status === "solved" ? solvedBadge : null}
          {topic.status === "closed" ? <Chip label="Closed" tone="neutral" /> : null}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2) }}>
        <Text numberOfLines={1} style={{ flex: 1, color: theme.color.muted, fontSize: 12.5 }}>
          {topic.creator_nickname || "Someone"} · {relativeTime(topic.last_message_at)}
        </Text>
        <ChatsTeardropIcon size={14} color={theme.color.muted} weight="fill" />
        <Text style={{ color: theme.color.muted, fontSize: 12.5 }}>{topic.reply_count}</Text>
      </View>
    </Pressable>
  );
}

/**
 * Title, the first post and tags. Nothing is cleared on Create: the dialog closes when
 * the server takes the topic, so a refusal keeps what was typed.
 */
function NewTopicDialog({
  open,
  onOpenChange,
  palette,
  creating,
  error,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  palette: ForumTag[];
  creating: boolean;
  error: string | null;
  onCreate: (title: string, text: string, tagIds: string[]) => void;
}) {
  const theme = useTheme();
  const sheet = useSheetInsets();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<ReadonlySet<string>>(new Set());
  const [wasOpen, setWasOpen] = useState(open);

  // A fresh form each time it opens, rather than the last topic's words.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle("");
      setBody("");
      setTags(new Set());
    }
  }

  const over = body.length - TOPIC_BODY_MAX;
  const canCreate = !!title.trim() && !!body.trim() && over <= 0 && !creating;

  const insets = useSafeAreaInsets();

  // A sheet that rides on the keyboard (C20), like adding a server: a dialog's buttons sat under it.
  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={() => onOpenChange(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ paddingLeft: sheet.left, paddingRight: sheet.right, flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityLabel="Close" onPress={() => onOpenChange(false)} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(5, 6, 10, 0.62)" }} />
        <Animated.View
          entering={SlideInDown.duration(260)}
          accessibilityViewIsModal
          style={{
            maxHeight: "92%",
            marginTop: insets.top,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderTopWidth: 1,
            borderColor: theme.color.border,
            backgroundColor: theme.color.surface,
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: theme.space(5), paddingBottom: Math.max(insets.bottom, theme.space(4)), gap: theme.space(3) }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ flex: 1, color: theme.color.text, fontSize: 20, fontWeight: "700" }}>New topic</Text>
              <Pressable onPress={() => onOpenChange(false)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}>
                <XIcon size={18} color={theme.color.muted} weight="bold" />
              </Pressable>
            </View>
            <TextField value={title} onChangeText={setTitle} placeholder="Title" maxLength={200} autoFocus />
            {palette.length > 0 ? (
              <View style={{ gap: theme.space(2) }}>
                <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "600" }}>Tags</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space(2) }}>
                  {palette.map((tag) => (
                    <Toggle
                      key={tag.id}
                      size="xsmall"
                      tone="neutral"
                      pressed={tags.has(tag.id)}
                      onPressedChange={() => setTags((current) => toggled(current, tag.id))}
                      accessibilityLabel={tag.name}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Swatch color={tag.color} fallback={theme.color.accent} />
                        <Text style={{ color: tags.has(tag.id) ? theme.color.text : theme.color.muted, fontSize: 12, fontWeight: "600" }}>
                          {tagLabel(tag)}
                        </Text>
                      </View>
                    </Toggle>
                  ))}
                </View>
              </View>
            ) : null}
            <TextField
              value={body}
              onChangeText={setBody}
              placeholder="What’s going on?"
              multiline
              minRows={4}
            />
            {over > 0 || error ? (
              <Alert severity="error">
                {over > 0 ? `That message is ${over} characters over the ${TOPIC_BODY_MAX} limit.` : error}
              </Alert>
            ) : null}
            <Button size="large" disabled={!canCreate} onPress={() => onCreate(title, body, [...tags])}>
              {creating ? "Posting…" : "Post topic"}
            </Button>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
