import { useCallback, useEffect, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { Image, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Dialog, Spinner, Surface, Text, TextField, useTheme, useToast } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";
import { TrashIcon } from "phosphor-react-native/src/icons/Trash";

import { useServerConnection } from "../../connection/ConnectionsProvider";
import { getServerHttpBase } from "../address";
import { useShell } from "../../shell/ShellContext";
import { useTabBarSpace } from "../../shell/TabBar";
import { useConfirm } from "../../ui/actionSheet";
import {
  deriveEmojiName,
  emojiImageUrl,
  isEmojiItem,
  isValidEmojiName,
  sanitizeTypedName,
  type EmojiItem,
} from "./emojis";

/**
 * This server's custom emoji: list, upload and delete. Reads over plain HTTP —
 * `/api/emojis` needs no token — but writes need `manage_emojis`.
 */
export function ServerEmojisScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const confirm = useConfirm();
  const tabBarSpace = useTabBarSpace();
  const { socket, getAccessToken } = useServerConnection();
  const { server } = useShell();
  const base = server?.host ? getServerHttpBase(server.host) : null;

  const [emojis, setEmojis] = useState<EmojiItem[] | null>(null);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!base) return;
    try {
      const response = await fetch(`${base}/api/emojis`);
      const list: unknown = response.ok ? await response.json() : [];
      setEmojis(Array.isArray(list) ? list.filter(isEmojiItem) : []);
    } catch {
      // Read again on the next reconnect; the list stays what it was.
    }
  }, [base]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!socket) return;
    socket.on("server:emojis:updated", refresh);
    return () => {
      socket.off("server:emojis:updated", refresh);
    };
  }, [socket, refresh]);

  const pick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.show({ description: "Photo access is off for Gryt. Turn it on in Settings.", severity: "error" });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setPendingUri(asset.uri);
    setPendingName(deriveEmojiName(asset.fileName ?? `emoji_${Date.now()}`));
  };

  const upload = async () => {
    if (!pendingUri || !base) return;
    if (!isValidEmojiName(pendingName)) {
      toast.show({ description: "2 to 32 letters, numbers or underscores.", severity: "error" });
      return;
    }
    const accessToken = await getAccessToken();
    if (!accessToken) {
      toast.show({ description: "Join the server first.", severity: "error" });
      return;
    }

    const form = new FormData();
    form.append("name", pendingName);
    form.append("file", { uri: pendingUri, name: `${pendingName}.jpg`, type: "image/jpeg" } as unknown as Blob);

    setUploading(true);
    try {
      const response = await fetch(`${base}/api/emojis`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        toast.show({ description: data.message || "The server would not take that emoji.", severity: "error" });
        return;
      }
      setPendingUri(null);
      toast.show({ title: `Added :${pendingName}:`, severity: "success" });
      void refresh();
    } catch {
      toast.show({ description: "Could not reach the server.", severity: "error" });
    } finally {
      setUploading(false);
    }
  };

  const remove = async (item: EmojiItem) => {
    const sure = await confirm({
      title: `Delete :${item.name}:?`,
      message: "Any message already using it keeps showing the name instead.",
      confirm: "Delete",
    });
    if (!sure || !base) return;
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    setDeleting(item.name);
    try {
      const response = await fetch(`${base}/api/emojis/${encodeURIComponent(item.name)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        toast.show({ description: data.message || "Could not delete it.", severity: "error" });
        return;
      }
      setEmojis((prev) => prev?.filter((e) => e.name !== item.name) ?? prev);
    } finally {
      setDeleting(null);
    }
  };

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
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
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
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700", flex: 1 }}>Emojis</Text>
        <Pressable
          onPress={() => void pick()}
          accessibilityRole="button"
          accessibilityLabel="Upload an emoji"
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
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.space(4),
          paddingBottom: theme.space(4) + tabBarSpace,
          gap: theme.space(2),
        }}
      >
        {emojis === null ? (
          <View style={{ alignItems: "center", paddingVertical: theme.space(8) }}>
            <Spinner />
          </View>
        ) : emojis.length === 0 ? (
          <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 20 }}>
            No custom emoji yet. Upload one and anybody here can use it, on this server only.
          </Text>
        ) : (
          emojis.map((item) => (
            <Surface
              key={item.name}
              level="surface"
              bordered
              radius="lg"
              style={{ flexDirection: "row", alignItems: "center", padding: theme.space(2), gap: theme.space(3) }}
            >
              {base ? (
                <Image
                  source={{ uri: emojiImageUrl(base, item.name) }}
                  style={{ width: 32, height: 32 }}
                  resizeMode="contain"
                />
              ) : null}
              <Text style={{ color: theme.color.text, fontSize: 14, flex: 1 }}>:{item.name}:</Text>
              <Pressable
                onPress={() => void remove(item)}
                disabled={deleting === item.name}
                accessibilityRole="button"
                accessibilityLabel={`Delete :${item.name}:`}
                hitSlop={8}
                style={{ padding: theme.space(1) }}
              >
                <TrashIcon size={18} color={theme.color.muted} />
              </Pressable>
            </Surface>
          ))
        )}
      </ScrollView>

      <Dialog.Root open={pendingUri !== null} onOpenChange={(open: boolean) => { if (!open) setPendingUri(null); }}>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.Title>Name this emoji</Dialog.Title>
            {pendingUri ? (
              <Image source={{ uri: pendingUri }} style={{ width: 64, height: 64, alignSelf: "center", marginVertical: theme.space(2) }} resizeMode="contain" />
            ) : null}
            <TextField
              value={pendingName}
              onChangeText={(v) => setPendingName(sanitizeTypedName(v))}
              placeholder="party_parrot"
              autoCapitalize="none"
              autoFocus
            />
            <Dialog.Footer>
              <Button tone="ghost" onPress={() => setPendingUri(null)} disabled={uploading}>
                Cancel
              </Button>
              <Button tone="primary" onPress={() => void upload()} disabled={uploading || !isValidEmojiName(pendingName)}>
                {uploading ? "Uploading…" : "Upload"}
              </Button>
            </Dialog.Footer>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </View>
  );
}
