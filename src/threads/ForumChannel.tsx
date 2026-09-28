import { useMemo, useState, type ReactNode } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import { Alert, Button, Chip, Dialog, Spinner, Text, TextField, Toggle, useTheme } from "@gryt/ui-native";
import { ChatsIcon } from "phosphor-react-native/src/icons/Chats";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";

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
  TOPIC_BODY_MAX,
  type ForumFilter,
  type ForumTopic,
} from "./threads";
import { useForumTopics } from "./useForumTopics";
import { useThreadUnread } from "./threadUnread";

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
  header: ReactNode;
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
      {header}
      {notice}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, borderBottomWidth: 1, borderColor: theme.color.border }}
        contentContainerStyle={{ gap: theme.space(2), padding: theme.space(3) }}
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
              <ChatsIcon size={28} color={theme.color.muted} weight="fill" />
              <Text style={{ color: theme.color.muted, fontSize: 14, textAlign: "center" }}>
                {forum.topics.length === 0 ? "No topics yet. Start the first one." : "Nothing matches this filter."}
              </Text>
            </View>
          }
        />
      )}

      <View style={{ padding: theme.space(3), paddingBottom: theme.space(3) + tabBarSpace }}>
        {mayPost ? (
          <Button
            onPress={() => {
              forum.clearCreateError();
              setComposing(true);
            }}
            startIcon={<PlusIcon size={16} color={theme.color.onAccent} weight="bold" />}
          >
            New topic
          </Button>
        ) : (
          <Text style={{ color: theme.color.muted, fontSize: 15, textAlign: "center" }}>
            You can read here, but not post.
          </Text>
        )}
      </View>

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

function toggled(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** "🐛 Bug", with the tag's colour as a square swatch, as the desktop's ForumTagChip draws it. */
function tagLabel(tag: ForumTag): string {
  return `${tag.emoji ? `${tag.emoji} ` : ""}${tag.name}`;
}

/* No theme hook in here: it is drawn inside the dialog's portal too. */
function Swatch({ color, fallback }: { color?: string | null; fallback: string }) {
  return <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: color || fallback }} />;
}

function TagRow({
  palette,
  picked,
  onToggle,
}: {
  palette: ForumTag[];
  picked: ReadonlySet<string>;
  onToggle: (id: string) => void;
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
          onPressedChange={() => onToggle(tag.id)}
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

  return (
    <Pressable
      onPress={() => openThread(topic)}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${meta}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingHorizontal: theme.space(4),
        paddingVertical: theme.space(3),
        borderBottomWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
      })}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 15, fontWeight: "700" }}>
          {title}
        </Text>
        {topic.tags.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {topic.tags.map((id) => {
              const tag = tagById.get(id);
              return tag ? <Chip key={id} label={tagLabel(tag)} tone="neutral" /> : null;
            })}
          </View>
        ) : null}
        <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 12 }}>
          {meta}
        </Text>
      </View>
      <UnreadPill count={unread} mentions={mentions} />
      {topic.status === "solved" ? <Chip label="Solved" tone="success" /> : null}
      {topic.status === "closed" ? <Chip label="Closed" tone="neutral" /> : null}
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

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup scrollable>
          <Dialog.Title>New topic</Dialog.Title>
          <View style={{ gap: theme.space(3), marginTop: theme.space(2) }}>
            <TextField value={title} onChangeText={setTitle} placeholder="Title" maxLength={200} autoFocus />
            <TextField
              value={body}
              onChangeText={setBody}
              placeholder="Describe what’s happening…"
              multiline
              minRows={5}
            />
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
            {over > 0 || error ? (
              <Alert severity="error">
                {over > 0 ? `That message is ${over} characters over the ${TOPIC_BODY_MAX} limit.` : error}
              </Alert>
            ) : null}
          </View>
          <Dialog.Footer>
            <Button tone="ghost" onPress={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!canCreate} onPress={() => onCreate(title, body, [...tags])}>
              {creating ? "Creating…" : "Create topic"}
            </Button>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
