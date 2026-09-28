import { useState } from "react";
import { View } from "react-native";
import type { GrytTheme } from "@gryt/theme";
import { decodeGrytTheme } from "@gryt/theme";
import { Alert, Button, Dialog, TextField, useTheme } from "@gryt/ui-native";

import { useAppearance } from "./appearance";

/**
 * Take a theme somebody sent you. The link and the JSON are read by the same
 * parser the desktop uses, so nothing here has to know the difference.
 */
export function AppearanceThemeImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const theme = useTheme();
  const { saveTheme } = useAppearance();

  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<GrytTheme | null>(null);
  const [name, setName] = useState("");

  function reset() {
    setInput("");
    setError(null);
    setIncoming(null);
    setName("");
  }

  function read() {
    const decoded = decodeGrytTheme(input);
    if (decoded === null) {
      setIncoming(null);
      setError(
        input.trim().startsWith("{")
          ? "There is no theme in that JSON."
          : "There is no theme in that link. Copy it from the generator with Copy link.",
      );
      return;
    }
    setIncoming(decoded.theme);
    setError(null);
    setName(decoded.theme.name ?? "Imported theme");
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <Dialog.Popup>
        <Dialog.Title>Import a theme</Dialog.Title>
        <Dialog.Description>
          Paste a link from the theme generator, or the JSON it exports.
        </Dialog.Description>

        <TextField
          accessibilityLabel="Theme link or JSON"
          multiline
          minRows={3}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://ui.gryt.chat/theme/generator?accent=…"
          value={input}
          onChangeText={(text) => {
            setInput(text);
            setError(null);
          }}
        />

        <Button size="small" disabled={input.trim() === ""} onPress={read}>
          Read it
        </Button>

        {error ? <Alert severity="error">{error}</Alert> : null}

        {incoming ? (
          <View style={{ gap: theme.space(3) }}>
            <View
              style={{
                flexDirection: "row",
                gap: theme.space(1),
                borderRadius: theme.radius.md,
                overflow: "hidden",
              }}
            >
              {SWATCHES.map((key) => (
                <View key={key} style={{ flex: 1, height: 28, backgroundColor: incoming.hue[key] }} />
              ))}
            </View>

            <TextField label="Name" value={name} onChangeText={setName} placeholder="Imported theme" />
          </View>
        ) : null}

        <Dialog.Footer>
          <Dialog.Close>
            <Button size="small" tone="ghost">
              Cancel
            </Button>
          </Dialog.Close>
          <Button
            size="small"
            disabled={incoming === null}
            onPress={() => {
              if (incoming === null) return;
              saveTheme(name, incoming);
              onOpenChange(false);
              reset();
            }}
          >
            Save and use it
          </Button>
        </Dialog.Footer>
      </Dialog.Popup>
    </Dialog.Root>
  );
}

/** Enough of the palette to tell one theme from another at a glance. */
const SWATCHES = ["accent", "secondary", "success", "warning", "danger"] as const;
