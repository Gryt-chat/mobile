import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Image, Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Checkbox, Meter, Spinner, Text, TextInput, useTheme, useToast } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
import { DotsThreeIcon } from "phosphor-react-native/src/icons/DotsThree";

import { AvatarFace } from "../../avatar/AvatarFace";
import { attachmentUrl, readableSize } from "../../chat/files";
import { ImageLightbox } from "../../chat/ImageLightbox";
import { useServerConnection } from "../../connection/ConnectionsProvider";
import { useShell } from "../../shell/ShellContext";
import { useTabBarSpace } from "../../shell/TabBar";
import { useActionSheet, useConfirm } from "../../ui/actionSheet";
import { ask, TIMEOUT, type FilesPage, type StorageFile, type StorageOverview } from "./storageApi";

const KIND_LABELS: Record<string, string> = { uploads: "Files in messages", avatars: "Avatars", banners: "Banners", emojis: "Emoji" };
const PURGES = [
  { label: "Older than 6 months", filter: { olderThanDays: 182 } },
  { label: "Older than 1 year", filter: { olderThanDays: 365 } },
  { label: "Bigger than 50 MB", filter: { minBytes: 50 * 1024 ** 2 } },
  { label: "Bigger than 200 MB", filter: { minBytes: 200 * 1024 ** 2 } },
];
const size = (n: number) => readableSize(n) ?? "0 B";
/** A thread's name, or the channel when the list isn't already one channel. */
const where = (f: StorageFile, showChannel: boolean) => {
  if (f.thread_title) return `Thread: ${f.thread_title}`;
  return showChannel && f.channel_name ? `#${f.channel_name}` : null;
};
const isImageFile = (f: StorageFile) => !!f.mime?.startsWith("image/");

/** Ticks per server, kept while the app runs so leaving the screen keeps them. */
const ticked = new Map<string, Map<string, number>>();

/** What takes space on this server, and deleting files to free it. The desktop's Storage tab. */
export function ServerStorageScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const present = useActionSheet();
  const confirm = useConfirm();
  const tabBarSpace = useTabBarSpace();
  const { socket } = useServerConnection();
  const { server } = useShell();
  const host = server?.host ?? "";
  const [overview, setOverview] = useState<StorageOverview | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [scope, setScope] = useState<{ conversationId?: string; label?: string } | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"size" | "date">("size");
  const [page, setPage] = useState<FilesPage | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [, bump] = useState(0);
  const picked = useMemo(() => {
    const existing = ticked.get(host) ?? new Map<string, number>();
    ticked.set(host, existing);
    return existing;
  }, [host]);

  const loadOverview = useCallback(() => {
    if (!socket) return;
    ask<StorageOverview>(socket, "storage:overview", {}).then((o) => { setFailed(null); setOverview(o); }).catch((e: Error) => setFailed(e.message));
  }, [socket]);
  useEffect(loadOverview, [loadOverview]);

  const loadFiles = useCallback((offset: number) => {
    if (!socket || !scope) return;
    ask<FilesPage>(socket, "storage:files", { conversationId: scope.conversationId, q: q || undefined, sort, dir: "desc", offset, limit: 50 })
      .then((next) => setPage((prev) => (offset > 0 && prev ? { ...next, items: [...prev.items, ...next.items] } : next)))
      .catch((e: Error) => toast.show({ title: e.message }));
  }, [socket, scope, q, sort, toast]);
  useEffect(() => {
    const t = setTimeout(() => loadFiles(0), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [loadFiles, q]);

  const remove = async (ids: string[], title: string, message: string) => {
    if (!socket || !(await confirm({ title, message, confirm: "Delete" }))) return;
    try {
      const r = await ask<{ deleted: number; bytes: number }>(socket, "storage:delete", { fileIds: ids }, "storage:deleted", 60_000);
      ids.forEach((id) => picked.delete(id));
      toast.show({ title: `Deleted ${r.deleted} ${r.deleted === 1 ? "file" : "files"}, ${size(r.bytes)} freed` });
      loadFiles(0);
      loadOverview();
    } catch (e) {
      toast.show({ title: (e as Error).message });
    }
  };

  const images = (page?.items ?? []).filter(isImageFile);
  const more = async (f: StorageFile) => {
    const options = [...(isImageFile(f) ? ["Preview"] : []), "Go to message", "Delete", "Cancel"];
    const choice = options[await present({ title: f.original_name ?? "File", options, destructiveButtonIndex: options.indexOf("Delete"), cancelButtonIndex: options.length - 1 })];
    if (choice === "Preview") setPreview(images.indexOf(f));
    if (choice === "Go to message") router.push({ pathname: "/channel/[id]", params: { id: f.conversation_id, at: f.message_id } });
    if (choice === "Delete") remove([f.file_id], `Delete ${f.original_name ?? "this file"}?`, `${size(f.size)}. It's gone for everyone, and the message shows it as deleted.`);
  };

  const freeUp = async () => {
    if (!socket) return;
    const options = [...PURGES.map((p) => p.label), "Cancel"];
    const i = await present({ title: "Free up space", message: "Delete files by age or size. Their messages stay.", options, cancelButtonIndex: PURGES.length });
    const purge = PURGES[i];
    if (!purge) return;
    try {
      const count = await ask<{ count: number; bytes: number }>(socket, "storage:purge", { ...purge.filter, dryRun: true });
      if (count.count === 0) { toast.show({ title: "No files match that." }); return; }
      if (!(await confirm({ title: `Delete ${count.count} files?`, message: `${size(count.bytes)}. They're gone for everyone, and their messages show them as deleted.`, confirm: "Delete" }))) return;
      const done = await ask<{ count: number; bytes: number }>(socket, "storage:purge", { ...purge.filter, dryRun: false }, "storage:purge", 120_000);
      toast.show({ title: `Deleted ${done.count} files, ${size(done.bytes)} freed` });
      loadOverview();
    } catch (e) {
      toast.show({ title: (e as Error).message });
    }
  };

  const label = (text: string) => (
    <Text style={{ color: theme.color.muted, fontSize: 11, fontWeight: "600", letterSpacing: 0.9 }}>{text.toUpperCase()}</Text>
  );
  const avatar = (f: StorageFile) =>
    f.uploader_avatar_file_id
      ? <Image source={{ uri: attachmentUrl(host, f.uploader_avatar_file_id, true) }} style={{ width: 28, height: 28, borderRadius: 14 }} />
      : <AvatarFace name={f.uploader_nickname} size={28} />;

  const header = (title: string, back: () => void, detail?: string) => (
    <View style={{ paddingTop: insets.top + theme.space(2), paddingHorizontal: theme.space(4), paddingBottom: theme.space(3), flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
      <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}
        style={{ width: 40, height: 40, borderRadius: theme.radius.full, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surfaceRaised }}>
        <CaretLeftIcon size={18} color={theme.color.text} weight="bold" />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700" }}>{title}</Text>
        {detail ? <Text style={{ color: theme.color.muted, fontSize: 12 }}>{detail}</Text> : null}
      </View>
    </View>
  );

  if (scope) {
    const items = page?.items ?? [];
    const selectedBytes = [...picked.values()].reduce((s, n) => s + n, 0);
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
        {header("Files", () => { setScope(null); setPage(null); loadOverview(); }, page ? `${scope.label ? `${scope.label} · ` : ""}${page.total} files · ${size(page.totalBytes)}` : undefined)}
        <View style={{ paddingHorizontal: theme.space(4), gap: theme.space(2) }}>
          <TextInput value={q} onChangeText={setQ} placeholder="Search files" accessibilityLabel="Search files" />
          <View style={{ flexDirection: "row", gap: theme.space(2) }}>
            <Button size="small" tone={sort === "size" ? "primary" : "neutral"} onPress={() => setSort("size")}>Biggest first</Button>
            <Button size="small" tone={sort === "date" ? "primary" : "neutral"} onPress={() => setSort("date")}>Newest first</Button>
          </View>
        </View>
        <FlatList
          data={items}
          keyExtractor={(f) => f.file_id}
          onEndReached={() => { if (page && items.length < page.total) loadFiles(items.length); }}
          contentContainerStyle={{ padding: theme.space(2), paddingBottom: tabBarSpace + 96 }}
          ListEmptyComponent={page ? <Text style={{ color: theme.color.muted, textAlign: "center", padding: theme.space(6) }}>No files match.</Text> : <Spinner />}
          renderItem={({ item: f }) => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3), minHeight: 60, paddingHorizontal: theme.space(2), borderRadius: theme.radius.md, backgroundColor: picked.has(f.file_id) ? theme.color.surfaceRaised : undefined }}>
              <Checkbox checked={picked.has(f.file_id)} accessibilityLabel={`Select ${f.original_name ?? "file"}`}
                onCheckedChange={() => { if (picked.has(f.file_id)) picked.delete(f.file_id); else picked.set(f.file_id, f.size); bump((n) => n + 1); }} />
              {avatar(f)}
              <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => (isImageFile(f) ? setPreview(images.indexOf(f)) : more(f))} accessibilityRole="button">
                <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 15 }}>{f.original_name ?? "File"}</Text>
                <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 12 }}>
                  {[f.uploader_nickname ?? "Someone", new Date(f.created_at).toLocaleDateString(), where(f, !scope.conversationId)].filter(Boolean).join(" · ")}
                </Text>
              </Pressable>
              <Text style={{ color: theme.color.muted, fontSize: 12, fontVariant: ["tabular-nums"] }}>{size(f.size)}</Text>
              <Pressable onPress={() => more(f)} accessibilityRole="button" accessibilityLabel={`More for ${f.original_name ?? "file"}`} hitSlop={8}
                style={{ width: 36, height: 44, alignItems: "center", justifyContent: "center" }}>
                <DotsThreeIcon size={20} color={theme.color.muted} weight="bold" />
              </Pressable>
            </View>
          )}
        />
        {picked.size > 0 ? (
          <View style={{ position: "absolute", left: theme.space(3), right: theme.space(3), bottom: tabBarSpace + theme.space(3), flexDirection: "row", alignItems: "center", gap: theme.space(2), padding: theme.space(2), paddingLeft: theme.space(4), borderRadius: theme.radius.full, backgroundColor: theme.color.surfaceRaised, borderWidth: 1, borderColor: theme.color.border }}>
            <Text style={{ color: theme.color.text, fontSize: 14, flex: 1 }}>{picked.size} · {size(selectedBytes)}</Text>
            <Button size="small" tone="ghost" onPress={() => { picked.clear(); bump((n) => n + 1); }}>Deselect all</Button>
            <Button size="small" tone="danger" onPress={() => remove([...picked.keys()], `Delete ${picked.size} files?`, `${size(selectedBytes)}. They're gone for everyone, and their messages show them as deleted.`)}>Delete</Button>
          </View>
        ) : null}
        <ImageLightbox
          images={images.map((f) => ({ uri: attachmentUrl(host, f.file_id), label: f.original_name ?? undefined }))}
          index={preview}
          onClose={() => setPreview(null)}
        />
      </View>
    );
  }

  const pct = overview?.limit ? Math.min(100, (overview.used / overview.limit) * 100) : 0;
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      {header("Storage", () => router.back())}
      {!overview && failed ? (
        <Text style={{ color: theme.color.muted, padding: theme.space(4) }}>{failed === TIMEOUT ? "This server doesn't show its storage yet. It needs an update first." : failed}</Text>
      ) : null}
      {!overview && !failed ? <Spinner /> : null}
      {overview ? (
        <View style={{ paddingHorizontal: theme.space(5), paddingBottom: tabBarSpace, gap: theme.space(5) }}>
          <View style={{ gap: theme.space(3) }}>
            {label("Space used")}
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: theme.space(2) }}>
              <Text style={{ color: theme.color.text, fontSize: 24, fontWeight: "700" }}>{size(overview.used)}</Text>
              {overview.limit ? <Text style={{ color: theme.color.muted, fontSize: 14 }}>of {size(overview.limit)}</Text> : null}
            </View>
            {overview.limit ? <Meter value={pct} /> : null}
            {Object.entries(overview.byKind).filter(([, b]) => b > 0).map(([kind, bytes]) => (
              <View key={kind} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: theme.color.muted, fontSize: 13 }}>{KIND_LABELS[kind] ?? "Other"}</Text>
                <Text style={{ color: theme.color.muted, fontSize: 12, fontVariant: ["tabular-nums"] }}>{size(bytes)}</Text>
              </View>
            ))}
            <Button onPress={freeUp}>Free up space</Button>
          </View>
          <View style={{ borderTopWidth: 1, borderColor: theme.color.border, paddingTop: theme.space(4) }}>
            {label("Biggest channels")}
            {overview.channels.map((c) => (
              <Pressable key={c.conversation_id} accessibilityRole="button" onPress={() => setScope({ conversationId: c.conversation_id, label: c.channel_name ? `#${c.channel_name}` : "Direct messages" })}
                style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2), minHeight: 48 }}>
                <Text style={{ color: theme.color.text, fontSize: 15, flex: 1 }}>{c.channel_name ? `#${c.channel_name}` : "Direct messages"}</Text>
                <Text style={{ color: theme.color.muted, fontSize: 12 }}>{size(c.bytes)}</Text>
                <CaretRightIcon size={14} color={theme.color.muted} />
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="link" onPress={() => setScope({})} style={{ borderTopWidth: 1, borderColor: theme.color.border, minHeight: 48, justifyContent: "center" }}>
            <Text style={{ color: theme.color.accent, fontSize: 15, textDecorationLine: "underline" }}>See all files</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
