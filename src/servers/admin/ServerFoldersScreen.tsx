import { useCallback, useEffect, useState } from "react";
import * as Crypto from "expo-crypto";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Spinner, Surface, Text, TextField, useTheme, useToast } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";
import { TrashIcon } from "phosphor-react-native/src/icons/Trash";
import { XIcon } from "phosphor-react-native/src/icons/X";

import type { Channel } from "../../connection/types";
import { useServerConnection } from "../../connection/ConnectionsProvider";
import { useTabBarSpace } from "../../shell/TabBar";
import { useActionSheet, useConfirm } from "../../ui/actionSheet";
import {
  channelIdsInFolder,
  folderDeleteImpact,
  folderRows,
  folderUpsertPayload,
  moveChannelPayload,
  nextPosition,
  type SidebarItemLike,
} from "./folders";

/**
 * Folders: create, rename, delete, and move channels in and out. Who a folder is
 * open to lives on its own screen — the same matrix a channel's permissions use.
 */
export function ServerFoldersScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const confirm = useConfirm();
  const present = useActionSheet();
  const tabBarSpace = useTabBarSpace();
  const { socket, getAccessToken, online, state } = useServerConnection();

  const [items, setItems] = useState<SidebarItemLike[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");

  const channels: Channel[] = state.status === "ready" ? state.channels : [];
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id;

  const refresh = useCallback(async () => {
    if (!socket || !online) return;
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    socket.emit("server:sidebar:list", { accessToken });
  }, [getAccessToken, online, socket]);

  useEffect(() => {
    if (!socket) return;

    const onSidebar = (payload: { items?: SidebarItemLike[] }) => {
      if (!payload?.items) return;
      setItems(payload.items);
    };

    const onError = (payload: { message?: string }) => {
      if (payload?.message) toast.show({ description: payload.message, severity: "error" });
    };

    // The socket's own broadcast after any sidebar write, so two people editing
    // this at once both end up looking at the same thing.
    const onDetails = () => void refresh();

    socket.on("server:sidebar", onSidebar);
    socket.on("server:details", onDetails);
    socket.on("server:error", onError);
    return () => {
      socket.off("server:sidebar", onSidebar);
      socket.off("server:details", onDetails);
      socket.off("server:error", onError);
    };
  }, [socket, refresh, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const folders = folderRows(items ?? []);
  const selected = items?.find((i) => i.id === editing) ?? null;

  const emitUpsert = async (payload: Record<string, unknown>) => {
    if (!socket || !online) {
      toast.show({ description: "Not connected to the server.", severity: "error" });
      return;
    }
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    socket.emit("server:sidebar:item:upsert", { accessToken, ...payload });
  };

  const createFolder = async () => {
    const itemId = `sb_fold_${Crypto.randomUUID().slice(0, 10)}`;
    await emitUpsert(folderUpsertPayload(itemId, "New folder", nextPosition(items ?? [])));
    setEditing(itemId);
    setName("New folder");
  };

  const open = (folder: SidebarItemLike) => {
    setEditing(folder.id);
    setName(folder.label ?? "");
  };

  const commitName = () => {
    if (!selected) return;
    void emitUpsert(folderUpsertPayload(selected.id, name, selected.position ?? 0));
  };

  const remove = async (folder: SidebarItemLike) => {
    const sure = await confirm({
      title: `Delete ${folder.label || "this folder"}?`,
      message: folderDeleteImpact(items ?? [], folder.id),
      confirm: "Delete",
    });
    if (!sure) return;
    if (!socket || !online) return;
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    socket.emit("server:sidebar:item:delete", { accessToken, itemId: folder.id });
    if (editing === folder.id) setEditing(null);
  };

  const moveOut = (item: SidebarItemLike) => void emitUpsert(moveChannelPayload(item, null));

  const addChannels = async () => {
    if (!selected || !items) return;
    const inThisFolder = new Set(channelIdsInFolder(items, selected.id));
    const candidates = items.filter(
      (i) => i.kind === "channel" && i.channelId && !inThisFolder.has(i.channelId),
    );
    if (candidates.length === 0) {
      toast.show({ description: "Every channel is already in this folder.", severity: "error" });
      return;
    }
    const options = [...candidates.map((c) => channelName(c.channelId as string)), "Cancel"];
    const index = await present({ title: "Add a channel", options, cancelButtonIndex: options.length - 1 });
    if (index < 0 || index >= candidates.length) return;
    void emitUpsert(moveChannelPayload(candidates[index], selected.id));
  };

  const title = editing === null ? "Folders" : "Edit folder";

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <View
        style={{
          paddingTop: insets.top + theme.space(1),
          paddingBottom: theme.space(2),
          paddingHorizontal: theme.space(2),
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(2),
          borderBottomWidth: 1,
          borderColor: theme.color.border,
          backgroundColor: theme.color.surface,
        }}
      >
        <Pressable
          onPress={() => (editing === null ? router.back() : setEditing(null))}
          accessibilityRole="button"
          accessibilityLabel={editing === null ? "Back" : "Back to the folder list"}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: theme.radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
          })}
        >
          <CaretLeftIcon size={20} color={theme.color.text} weight="bold" />
        </Pressable>
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700", flex: 1 }}>{title}</Text>
        {editing === null && items !== null && (
          <Pressable
            onPress={() => void createFolder()}
            accessibilityRole="button"
            accessibilityLabel="New folder"
            hitSlop={8}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: theme.radius.full,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
            })}
          >
            <PlusIcon size={20} color={theme.color.text} weight="bold" />
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.space(4),
          paddingBottom: theme.space(4) + tabBarSpace,
          gap: theme.space(3),
        }}
      >
        {items === null ? (
          <View style={{ alignItems: "center", paddingVertical: theme.space(8) }}>
            <Spinner />
          </View>
        ) : editing === null ? (
          folders.length === 0 ? (
            <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 20 }}>
              No folders yet. A folder groups channels together and can hold its own
              permissions, which every channel in it follows unless it has its own.
            </Text>
          ) : (
            folders.map((folder) => {
              const count = channelIdsInFolder(items, folder.id).length;
              return (
                <Surface
                  key={folder.id}
                  level="surface"
                  bordered
                  radius="lg"
                  style={{ flexDirection: "row", alignItems: "center", padding: theme.space(3), gap: theme.space(2) }}
                >
                  <Pressable
                    onPress={() => open(folder)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${folder.label || "folder"}`}
                    style={{ flex: 1, gap: 2 }}
                  >
                    <Text style={{ color: theme.color.text, fontSize: 15, fontWeight: "600" }}>
                      {folder.label || "New folder"}
                    </Text>
                    <Text style={{ color: theme.color.muted, fontSize: 12 }}>
                      {count === 0 ? "No channels" : `${count} channel${count === 1 ? "" : "s"}`}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void remove(folder)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${folder.label || "folder"}`}
                    hitSlop={8}
                    style={{ padding: theme.space(1) }}
                  >
                    <TrashIcon size={18} color={theme.color.muted} />
                  </Pressable>
                </Surface>
              );
            })
          )
        ) : selected ? (
          <>
            <TextField
              label="Name"
              value={name}
              onChangeText={setName}
              onBlur={commitName}
              placeholder="New folder"
            />

            <Button
              tone="neutral"
              size="small"
              onPress={() =>
                router.push({
                  pathname: "/server-settings/folder-permissions",
                  params: { id: selected.id, name: selected.label ?? "" },
                } as never)
              }
            >
              Who can use this folder
            </Button>

            <View style={{ gap: theme.space(2) }}>
              <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "600" }}>
                Channels in this folder
              </Text>
              {channelIdsInFolder(items, selected.id).length === 0 ? (
                <Text style={{ color: theme.color.muted, fontSize: 13 }}>None yet.</Text>
              ) : (
                channelIdsInFolder(items, selected.id).map((channelId) => {
                  const item = items.find((i) => i.kind === "channel" && i.channelId === channelId);
                  if (!item) return null;
                  return (
                    <Surface
                      key={channelId}
                      level="surface"
                      bordered
                      radius="lg"
                      style={{ flexDirection: "row", alignItems: "center", padding: theme.space(3), gap: theme.space(2) }}
                    >
                      <Text style={{ color: theme.color.text, fontSize: 14, flex: 1 }}>
                        {channelName(channelId)}
                      </Text>
                      <Pressable
                        onPress={() => moveOut(item)}
                        accessibilityRole="button"
                        accessibilityLabel={`Take ${channelName(channelId)} out of this folder`}
                        hitSlop={8}
                        style={{ padding: theme.space(1) }}
                      >
                        <XIcon size={16} color={theme.color.muted} />
                      </Pressable>
                    </Surface>
                  );
                })
              )}
              <Button tone="ghost" size="small" onPress={() => void addChannels()}>
                <PlusIcon size={14} />
                Add a channel
              </Button>
            </View>

            <Button tone="danger" size="small" onPress={() => void remove(selected)}>
              Delete folder
            </Button>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
