import { Image, View } from "react-native";
import { Button, Surface, Text, useTheme } from "@gryt/ui-native";

import { Dialog } from "../../ui/Dialog";

export interface EmojiReplacement {
  name: string;
  beforeUri: string;
  afterUri: string;
}

/** The same message twice, old picture and new, in the text and as a reaction, before it changes for everyone. */
export function EmojiReplaceDialog({
  replacement,
  busy,
  onConfirm,
  onCancel,
}: {
  replacement: EmojiReplacement | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  return (
    <Dialog.Root open={replacement !== null} onOpenChange={(open: boolean) => { if (!open && !busy) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Title>Replace :{replacement?.name}:?</Dialog.Title>
          <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 20 }}>
            Everyone on this server sees the new picture, in old messages and reactions too.
          </Text>
          {replacement ? (
            <View style={{ flexDirection: "row", gap: theme.space(2), marginVertical: theme.space(3) }}>
              <Sample label="Before" uri={replacement.beforeUri} name={replacement.name} />
              <Sample label="After" uri={replacement.afterUri} name={replacement.name} />
            </View>
          ) : null}
          <Dialog.Footer>
            <Button tone="ghost" onPress={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button tone="primary" onPress={onConfirm} disabled={busy}>
              {busy ? "Replacing…" : "Replace"}
            </Button>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Sample({ label, uri, name }: { label: string; uri: string; name: string }) {
  const theme = useTheme();
  return (
    <Surface level="raised" radius="md" style={{ flex: 1, padding: theme.space(3), gap: theme.space(2) }}>
      <Text style={{ color: theme.color.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.8 }}>{label.toUpperCase()}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
        <Text style={{ color: theme.color.text, fontSize: 15 }}>Looks good </Text>
        <Image source={{ uri }} style={{ width: 22, height: 22 }} resizeMode="contain" accessibilityLabel={`:${name}:`} />
      </View>
      {/* Reactions.tsx's chip, drawn here because that one reads the server's list, not a local preview. */}
      <View
        style={{
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(1.5),
          height: 30,
          paddingHorizontal: theme.space(2.5),
          borderRadius: 999,
          borderWidth: 1,
          borderColor: theme.color.border,
          backgroundColor: theme.color.surfaceRaised,
        }}
      >
        <Image source={{ uri }} style={{ width: 19, height: 19 }} resizeMode="contain" />
        <Text style={{ fontSize: 13, color: theme.color.muted, fontWeight: "600" }}>3</Text>
      </View>
    </Surface>
  );
}
