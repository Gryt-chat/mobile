import { useCallback, useEffect, useState } from "react";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Image, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Spinner, Surface, Text, TextField, useTheme, useToast } from "@gryt/ui-native";
import { Dialog } from "../../ui/Dialog";
import { ArrowsClockwiseIcon } from "phosphor-react-native/src/icons/ArrowsClockwise";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";
import { TrashSimpleIcon } from "phosphor-react-native/src/icons/TrashSimple";

import { useServerConnection } from "../../connection/ConnectionsProvider";
import { getServerHttpBase } from "../address";
import { useShell } from "../../shell/ShellContext";
import { useTabBarSpace } from "../../shell/TabBar";
import { useConfirm } from "../../ui/actionSheet";
import { COMPATIBLE_PHOTOS } from "../../chat/photoPicker";
import { type EmojiReplacement, EmojiReplaceDialog } from "./EmojiReplaceDialog";
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
  const [pendingMime, setPendingMime] = useState("image/jpeg");
  const [pendingName, setPendingName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [replacement, setReplacement] = useState<(EmojiReplacement & { mime: string }) | null>(null);
  const [replacing, setReplacing] = useState(false);

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

  const pickImage = async (): Promise<ImagePicker.ImagePickerAsset | null> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.show({ description: "Photo access is off for Gryt. Turn it on in Settings.", severity: "error" });
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, ...COMPATIBLE_PHOTOS });
    return result.canceled || result.assets.length === 0 ? null : result.assets[0];
  };

  /** Posts one image under `name`; the server swaps an existing emoji of that name. True once it's taken. */
  const send = async (uri: string, name: string, mime: string): Promise<boolean> => {
    if (!base) return false;
    const accessToken = await getAccessToken();
    if (!accessToken) {
      toast.show({ description: "Join the server first.", severity: "error" });
      return false;
    }
    const form = new FormData();
    form.append("name", name);
    // Expo's fetch refuses a `{ uri }` part; `{ bytes }` is the shape it takes, as in chat/upload.ts.
    form.append("file", { name, type: mime, bytes: () => new File(uri).bytes() } as unknown as Blob);
    try {
      const response = await fetch(`${base}/api/emojis`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        toast.show({ description: data.message || "The server would not take that emoji.", severity: "error" });
        return false;
      }
      void refresh();
      return true;
    } catch {
      toast.show({ description: "Could not reach the server.", severity: "error" });
      return false;
    }
  };

  const pick = async () => {
    const asset = await pickImage();
    if (!asset) return;
    setPendingUri(asset.uri);
    setPendingMime(asset.mimeType ?? "image/jpeg");
    setPendingName(deriveEmojiName(asset.fileName ?? `emoji_${Date.now()}`));
  };

  const upload = async () => {
    if (!pendingUri) return;
    if (!isValidEmojiName(pendingName)) {
      toast.show({ description: "2 to 32 letters, numbers or underscores.", severity: "error" });
      return;
    }
    setUploading(true);
    try {
      if (await send(pendingUri, pendingName, pendingMime)) {
        setPendingUri(null);
        toast.show({ title: `Added :${pendingName}:`, severity: "success" });
      }
    } finally {
      setUploading(false);
    }
  };

  const startReplace = async (item: EmojiItem) => {
    if (!base) return;
    const asset = await pickImage();
    if (asset) {
      setReplacement({ name: item.name, beforeUri: emojiImageUrl(base, item.name, item.file_id), afterUri: asset.uri, mime: asset.mimeType ?? "image/jpeg" });
    }
  };

  const replace = async () => {
    if (!replacement) return;
    setReplacing(true);
    try {
      if (await send(replacement.afterUri, replacement.name, replacement.mime)) {
        toast.show({ title: `Replaced :${replacement.name}:`, severity: "success" });
        setReplacement(null);
      }
    } finally {
      setReplacing(false);
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
        {emojis === null && (
          <View style={{ alignItems: "center", paddingVertical: theme.space(8) }}>
            <Spinner />
          </View>
        )}
        {emojis !== null && emojis.length === 0 && (
          <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 20 }}>
            No custom emoji yet. Upload one and anybody here can use it, on this server only.
          </Text>
        )}
        {emojis !== null && emojis.length > 0 && (
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
                  source={{ uri: emojiImageUrl(base, item.name, item.file_id) }}
                  style={{ width: 32, height: 32 }}
                  resizeMode="contain"
                />
              ) : null}
              <Text style={{ color: theme.color.text, fontSize: 14, flex: 1 }}>:{item.name}:</Text>
              <Pressable
                onPress={() => void startReplace(item)}
                accessibilityRole="button"
                accessibilityLabel={`Replace :${item.name}:`}
                hitSlop={8}
                style={{ padding: theme.space(1) }}
              >
                <ArrowsClockwiseIcon size={18} color={theme.color.muted} />
              </Pressable>
              <Pressable
                onPress={() => void remove(item)}
                disabled={deleting === item.name}
                accessibilityRole="button"
                accessibilityLabel={`Delete :${item.name}:`}
                hitSlop={8}
                style={{ padding: theme.space(1) }}
              >
                <TrashSimpleIcon size={18} color={theme.color.muted} />
              </Pressable>
            </Surface>
          ))
        )}
      </ScrollView>

      <EmojiReplaceDialog
        replacement={replacement}
        busy={replacing}
        onConfirm={() => void replace()}
        onCancel={() => setReplacement(null)}
      />

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
