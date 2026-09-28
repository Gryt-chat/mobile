import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { GrytHueKey, GrytNeutralKey, GrytTheme } from "@gryt/theme";
import {
  cloneGrytTheme,
  grytTheme,
  grytThemeHues,
  isHexColor,
  normalizeHexColor,
} from "@gryt/theme";
import { Divider, Sheet, Surface, Text, TextField, useTheme } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";

import { useAppearance } from "./appearance";
import {
  isCustomThemeId,
  resolveActiveTheme,
  setGrytThemeHue,
  setGrytThemeNeutral,
  themeName,
} from "./appearanceTheme";
import { HsvColorPicker } from "./HsvColorPicker";

const SURFACE_KEYS: GrytNeutralKey[] = ["bg", "surface", "surfaceRaised", "surfaceHover", "border"];
const TEXT_KEYS: GrytNeutralKey[] = ["text", "muted"];
const ACCENT_KEYS: GrytHueKey[] = ["accent", "accentLight", "onAccent"];
const SECONDARY_KEYS: GrytHueKey[] = ["secondary", "secondaryLight", "onSecondary"];
const STATUS_KEYS: GrytHueKey[] = ["success", "danger", "dangerLight", "onDanger", "warning"];

const HUE_LABELS: Record<GrytHueKey, string> = {
  accent: "Accent",
  accentLight: "Accent, light",
  secondary: "Secondary",
  secondaryLight: "Secondary, light",
  success: "Success",
  danger: "Danger",
  dangerLight: "Danger, light",
  warning: "Warning",
  onAccent: "Text on accent",
  onSecondary: "Text on secondary",
  onDanger: "Text on danger",
};

const NEUTRAL_LABELS: Record<GrytNeutralKey, string> = {
  bg: "Page",
  surface: "Surface",
  surfaceRaised: "Raised surface",
  surfaceHover: "Surface, hovered",
  border: "Border",
  muted: "Muted text",
  text: "Text",
};

type Field = { kind: "hue"; key: GrytHueKey } | { kind: "neutral"; key: GrytNeutralKey };

/**
 * Colours only — fonts, motion and radius stay on the desktop. Editing a preset
 * forks a custom theme on the first change; editing one already on this phone writes into it directly.
 */
export function AppearanceThemeEditorScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { activeThemeId, customThemes, resolvedAppearance, saveTheme, updateTheme } =
    useAppearance();

  const [editingId, setEditingId] = useState<string | null>(
    isCustomThemeId(activeThemeId) ? activeThemeId : null,
  );
  const [draft, setDraft] = useState<GrytTheme>(() =>
    cloneGrytTheme(resolveActiveTheme(activeThemeId, customThemes) ?? grytTheme),
  );
  const [field, setField] = useState<Field | null>(null);

  function commit(next: GrytTheme) {
    setDraft(next);
    if (editingId !== null) {
      updateTheme(editingId, next);
      return;
    }
    setEditingId(saveTheme(`${themeName(activeThemeId, customThemes)} copy`, next));
  }

  const hues = grytThemeHues(draft, resolvedAppearance);
  const neutrals = draft[resolvedAppearance];

  function openField(next: Field) {
    setField(next);
  }

  const fieldValue =
    field === null ? "#000000" : field.kind === "hue" ? hues[field.key] : neutrals[field.key];
  const fieldLabel =
    field === null ? "" : field.kind === "hue" ? HUE_LABELS[field.key] : NEUTRAL_LABELS[field.key];

  function changeField(hex: string) {
    if (field === null) return;
    setDraft(
      field.kind === "hue"
        ? setGrytThemeHue(draft, resolvedAppearance, field.key, hex)
        : setGrytThemeNeutral(draft, resolvedAppearance, field.key, hex),
    );
  }

  function commitField(hex: string) {
    if (field === null) return;
    commit(
      field.kind === "hue"
        ? setGrytThemeHue(draft, resolvedAppearance, field.key, hex)
        : setGrytThemeNeutral(draft, resolvedAppearance, field.key, hex),
    );
  }

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
          Edit colours
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.space(4), gap: theme.space(4) }}>
        <Text style={{ color: theme.color.muted, fontSize: 15, lineHeight: 21 }}>
          Editing the {resolvedAppearance} half of{" "}
          {themeName(editingId ?? activeThemeId, customThemes)}. A change here saves right away.
        </Text>

        <Group title="Surfaces">
          {SURFACE_KEYS.map((key) => (
            <ColorRow
              key={key}
              label={NEUTRAL_LABELS[key]}
              onPress={() => openField({ kind: "neutral", key })}
              value={neutrals[key]}
            />
          ))}
        </Group>

        <Group title="Text">
          {TEXT_KEYS.map((key) => (
            <ColorRow
              key={key}
              label={NEUTRAL_LABELS[key]}
              onPress={() => openField({ kind: "neutral", key })}
              value={neutrals[key]}
            />
          ))}
        </Group>

        <Group title="Accent">
          {ACCENT_KEYS.map((key) => (
            <ColorRow
              key={key}
              label={HUE_LABELS[key]}
              onPress={() => openField({ kind: "hue", key })}
              value={hues[key]}
            />
          ))}
        </Group>

        <Group title="Secondary">
          {SECONDARY_KEYS.map((key) => (
            <ColorRow
              key={key}
              label={HUE_LABELS[key]}
              onPress={() => openField({ kind: "hue", key })}
              value={hues[key]}
            />
          ))}
        </Group>

        <Group title="Status">
          {STATUS_KEYS.map((key) => (
            <ColorRow
              key={key}
              label={HUE_LABELS[key]}
              onPress={() => openField({ kind: "hue", key })}
              value={hues[key]}
            />
          ))}
        </Group>
      </ScrollView>

      <Sheet
        onOpenChange={(open) => {
          if (!open) setField(null);
        }}
        open={field !== null}
        snapPoints={["55%"]}
      >
        <Sheet.Content>
          <Sheet.Title>{fieldLabel}</Sheet.Title>
          <FieldEditor onChange={changeField} onCommit={commitField} value={fieldValue} />
        </Sheet.Content>
      </Sheet>
    </View>
  );
}

function FieldEditor({
  value,
  onChange,
  onCommit,
}: {
  value: string;
  onChange: (hex: string) => void;
  onCommit: (hex: string) => void;
}) {
  const theme = useTheme();
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);

  // A drag changes `value` from outside, and the hex box has to follow —
  // same reasoning as the desktop's own ColorField.
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }

  return (
    <View style={{ gap: theme.space(4) }}>
      <HsvColorPicker onChange={onChange} onCommit={onCommit} value={value} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: theme.radius.md,
            backgroundColor: value,
            borderWidth: 1,
            borderColor: theme.color.border,
          }}
        />
        <TextField
          accessibilityLabel="Hex value"
          autoCapitalize="none"
          autoCorrect={false}
          onBlur={() => setText(value)}
          onChangeText={(next) => {
            setText(next);
            if (!isHexColor(next)) return;
            const hex = normalizeHexColor(next);
            onChange(hex);
            onCommit(hex);
          }}
          style={{ flex: 1 }}
          value={text}
        />
      </View>
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space(1) }}>
      <Text
        style={{
          color: theme.color.muted,
          fontSize: 13,
          fontWeight: "700",
          letterSpacing: 0.4,
          textTransform: "uppercase",
          paddingBottom: theme.space(1),
        }}
      >
        {title}
      </Text>
      <Surface bordered radius="lg" style={{ paddingHorizontal: theme.space(3) }}>
        {separated(children)}
      </Surface>
    </View>
  );
}

function separated(children: ReactNode): ReactNode {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  return items.map((child, index) => (
    // eslint-disable-next-line react/no-array-index-key
    <View key={index}>
      {index > 0 ? <Divider /> : null}
      {child}
    </View>
  ));
}

function ColorRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={`${label}, colour picker`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(3),
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: theme.radius.sm,
          backgroundColor: value,
          borderWidth: 1,
          borderColor: theme.color.border,
        }}
      />
      <Text style={{ flex: 1, color: theme.color.text, fontSize: 15, fontWeight: "500" }}>
        {label}
      </Text>
      <Text style={{ color: theme.color.muted, fontSize: 13, fontFamily: "monospace" }}>
        {value}
      </Text>
    </Pressable>
  );
}
