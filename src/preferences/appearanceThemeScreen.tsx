import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { GrytThemePreset } from "@gryt/theme";
import { encodeGrytTheme, grytPresetsByCollection } from "@gryt/theme";
import { Accordion, Button, Text, useTheme, useToast } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";
import { LinkSimpleIcon } from "phosphor-react-native/src/icons/LinkSimple";
import { PaletteIcon } from "phosphor-react-native/src/icons/Palette";
import { TrashIcon } from "phosphor-react-native/src/icons/Trash";
import { UploadSimpleIcon } from "phosphor-react-native/src/icons/UploadSimple";

import { useConfirm } from "../ui/actionSheet";
import { presetIdFromThemeId, presetThemeId, type SavedTheme } from "./appearanceTheme";
import { useAppearance } from "./appearance";
import { AppearanceThemeImportDialog } from "./appearanceThemeImport";

const GENERATOR = "https://ui.gryt.chat/theme/generator";
const YOURS = "Yours";

/**
 * Pick a shipped preset, a theme imported from a link somebody sent, or edit
 * one's colours directly. GRYT-1538 — see AppearanceThemeEditorScreen.
 */
export function AppearanceThemeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { activeThemeId, setActiveThemeId, customThemes, deleteTheme } = useAppearance();
  const [importing, setImporting] = useState(false);

  const openCollection = useMemo(
    () => collectionOf(activeThemeId),
    [activeThemeId],
  );
  const [open, setOpen] = useState<string[]>([openCollection]);

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
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700" }}>
          Theme
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.space(4), gap: theme.space(4) }}>
        <Text style={{ color: theme.color.muted, fontSize: 15, lineHeight: 21 }}>
          Every palette Gryt ships, plus anything imported from a link. Pick one to
          use it right away.
        </Text>

        <Accordion.Root type="multiple" value={open} onValueChange={(v) => setOpen(v as string[])}>
          {grytPresetsByCollection.map((group) => (
            <Accordion.Item key={group.collection} value={group.collection}>
              <Accordion.Trigger>
                <CollectionLabel
                  accents={group.presets.map((preset) => preset.theme.hue.accent)}
                  count={group.presets.length}
                  name={group.collection}
                  note={group.note}
                />
              </Accordion.Trigger>
              <Accordion.Panel>
                <View style={{ gap: theme.space(1) }}>
                  {group.presets.map((preset) => (
                    <PresetRow
                      key={preset.id}
                      active={
                        preset.id === "gryt"
                          ? activeThemeId === null
                          : activeThemeId === presetThemeId(preset.id)
                      }
                      preset={preset}
                      onSelect={() =>
                        setActiveThemeId(preset.id === "gryt" ? null : presetThemeId(preset.id))
                      }
                    />
                  ))}
                </View>
              </Accordion.Panel>
            </Accordion.Item>
          ))}

          {customThemes.length > 0 ? (
            <Accordion.Item value={YOURS}>
              <Accordion.Trigger>
                <CollectionLabel
                  accents={customThemes.map((entry) => entry.theme.hue.accent)}
                  count={customThemes.length}
                  name={YOURS}
                  note="Imported from a link."
                />
              </Accordion.Trigger>
              <Accordion.Panel>
                <View style={{ gap: theme.space(1) }}>
                  {customThemes.map((entry) => (
                    <CustomThemeRow
                      key={entry.id}
                      active={activeThemeId === entry.id}
                      entry={entry}
                      onDelete={() => deleteTheme(entry.id)}
                      onSelect={() => setActiveThemeId(entry.id)}
                    />
                  ))}
                </View>
              </Accordion.Panel>
            </Accordion.Item>
          ) : null}
        </Accordion.Root>

        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
          <Button
            size="small"
            startIcon={<UploadSimpleIcon size={15} color={theme.color.onAccent} />}
            onPress={() => setImporting(true)}
          >
            Import a theme
          </Button>
          <Pressable
            accessibilityRole="link"
            onPress={() => void WebBrowser.openBrowserAsync(GENERATOR)}
          >
            <Text style={{ color: theme.color.accent, fontSize: 13, fontWeight: "600" }}>
              Make one
            </Text>
          </Pressable>
        </View>

        <Button
          size="small"
          tone="neutral"
          startIcon={<PaletteIcon size={15} color={theme.color.text} />}
          onPress={() => router.push("/appearance-theme-editor")}
        >
          Edit colours
        </Button>
      </ScrollView>

      <AppearanceThemeImportDialog open={importing} onOpenChange={setImporting} />
    </View>
  );
}

/** Which collection to open first: wherever the theme in use lives. */
function collectionOf(activeThemeId: string | null): string {
  const id = presetIdFromThemeId(activeThemeId);
  if (id === null) return activeThemeId === null ? "Gryt" : YOURS;
  const group = grytPresetsByCollection.find((g) => g.presets.some((p) => p.id === id));
  return group?.collection ?? "Gryt";
}

function CollectionLabel({
  accents,
  count,
  name,
  note,
}: {
  accents: string[];
  count: number;
  name: string;
  note: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: theme.space(2) }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: theme.color.text, fontSize: 15, fontWeight: "600" }}>{name}</Text>
        <Text style={{ color: theme.color.muted, fontSize: 12 }} numberOfLines={1}>
          {note}
        </Text>
      </View>
      {/* Four dots is enough to tell one collection's range from another with
          the panel shut, the same reasoning the desktop library uses. */}
      <View style={{ flexDirection: "row", gap: 4 }}>
        {accents.slice(0, 4).map((accent, i) => (
          <View
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: accent,
              borderWidth: 1,
              borderColor: theme.color.border,
            }}
          />
        ))}
      </View>
      <Text style={{ color: theme.color.muted, fontSize: 12 }}>{count}</Text>
    </View>
  );
}

function PresetRow({
  active,
  preset,
  onSelect,
}: {
  active: boolean;
  preset: GrytThemePreset;
  onSelect: () => void;
}) {
  return (
    <ThemeRow
      active={active}
      accent={preset.theme.hue.accent}
      name={preset.name}
      note={preset.note}
      source={preset.source}
      onSelect={onSelect}
    />
  );
}

function CustomThemeRow({
  active,
  entry,
  onSelect,
  onDelete,
}: {
  active: boolean;
  entry: SavedTheme;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();

  return (
    <ThemeRow
      active={active}
      accent={entry.theme.hue.accent}
      name={entry.name}
      note="Imported"
      onSelect={onSelect}
      onCopyLink={() => {
        const link = `${GENERATOR}?${encodeGrytTheme(entry.theme).toString()}`;
        void Clipboard.setStringAsync(link);
        // The link opens the generator with the theme loaded — the same thing a
        // desktop's copy of the same button says, so a phone theme reads the same way.
        toast.show({ title: "Link copied — it opens in the generator", severity: "success" });
      }}
      onDelete={() =>
        void confirm({
          title: `Delete ${entry.name}?`,
          message:
            "It is only on this phone. Import it again from the link it came from, if you kept it.",
          confirm: "Delete",
        }).then((ok) => {
          if (ok) onDelete();
        })
      }
    />
  );
}

function ThemeRow({
  active,
  accent,
  name,
  note,
  source,
  onSelect,
  onCopyLink,
  onDelete,
}: {
  active: boolean;
  accent: string;
  name: string;
  note: string;
  source?: string;
  onSelect: () => void;
  onCopyLink?: () => void;
  onDelete?: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: active ? theme.color.accent : theme.color.border,
        backgroundColor: active ? theme.color.surfaceRaised : "transparent",
        paddingHorizontal: theme.space(3),
      }}
    >
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${name}. ${note}`}
        onPress={onSelect}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(3),
          paddingVertical: theme.space(2.5),
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: accent,
            borderWidth: 1,
            borderColor: theme.color.border,
          }}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: theme.color.text, fontSize: 15, fontWeight: active ? "600" : "500" }}>
            {name}
          </Text>
          <Text style={{ color: theme.color.muted, fontSize: 12 }} numberOfLines={1}>
            {source ? `${note} · ${source}` : note}
          </Text>
        </View>
        {active ? (
          <CheckCircleIcon size={20} color={theme.color.accent} weight="fill" />
        ) : (
          <View style={{ width: 20 }} />
        )}
      </Pressable>

      {onCopyLink ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Copy a link to ${name}`}
          hitSlop={8}
          onPress={onCopyLink}
          style={{ padding: theme.space(1) }}
        >
          <LinkSimpleIcon size={18} color={theme.color.muted} />
        </Pressable>
      ) : null}

      {onDelete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${name}`}
          hitSlop={8}
          onPress={onDelete}
          style={{ padding: theme.space(1) }}
        >
          <TrashIcon size={18} color={theme.color.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
