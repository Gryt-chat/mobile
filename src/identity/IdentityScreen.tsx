import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { WarningIcon } from "phosphor-react-native/src/icons/Warning";

import { getOrCreateSeed, restoreSeed } from "./seed";
import { seedToWords, wordsToSeed } from "./words";

/**
 * Your identity, and the twenty-four words that are it.
 *
 * The words are the identity — not a password for it, not a hint. Anyone who
 * reads them is you on every server you have joined, and losing them loses
 * every guest membership at once, because the key is derived rather than
 * stored anywhere else. Both halves of that are said on the screen rather than
 * left for somebody to work out.
 *
 * They are hidden until asked for. A backup screen that shows the phrase the
 * moment it opens is a phrase shown to whoever is stood behind you, and the
 * common reason to be here is restoring rather than exporting.
 */
export function IdentityScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [words, setWords] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const [entry, setEntry] = useState("");
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    // Read once so the reveal is instant, but do not show it.
    void getOrCreateSeed().then((seed) => setWords(seedToWords(seed)));
  }, []);

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
          Your identity
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: theme.space(4), gap: theme.space(5) }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: theme.space(2) }}>
          <Text style={{ color: theme.color.text, fontSize: 17, fontWeight: "600" }}>
            Twenty-four words
          </Text>
          <Text style={{ color: theme.color.muted, fontSize: 15, lineHeight: 21 }}>
            These words are your identity — not a password for it. Anyone who reads them is
            you on every server you have joined, and if you lose them you lose those
            memberships: the key is worked out from the words, not stored anywhere else.
          </Text>
        </View>

        {revealed && words ? (
          <View style={{ gap: theme.space(3) }}>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                padding: theme.space(3),
                borderRadius: theme.radius.lg,
                borderWidth: 1,
                borderColor: theme.color.border,
                backgroundColor: theme.color.surfaceRaised,
              }}
            >
              {words.split(" ").map((word, i) => (
                <View key={`${word}-${i}`} style={{ width: "50%", paddingVertical: 4 }}>
                  <Text style={{ color: theme.color.muted, fontSize: 13 }}>
                    {i + 1}.{" "}
                    <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "600" }}>
                      {word}
                    </Text>
                  </Text>
                </View>
              ))}
            </View>

            <Action
              label={copied ? "Copied" : "Copy to clipboard"}
              onPress={() => {
                void Clipboard.setStringAsync(words).then(() => setCopied(true));
              }}
            />
          </View>
        ) : (
          <Action label="Show my words" onPress={() => setRevealed(true)} primary />
        )}

        <View style={{ height: 1, backgroundColor: theme.color.border }} />

        <View style={{ gap: theme.space(3) }}>
          <Text style={{ color: theme.color.text, fontSize: 17, fontWeight: "600" }}>
            Restore from words
          </Text>
          <View
            style={{
              flexDirection: "row",
              gap: theme.space(3),
              padding: theme.space(3),
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: theme.color.warning,
            }}
          >
            <WarningIcon size={20} color={theme.color.warning} weight="fill" />
            <Text style={{ color: theme.color.text, fontSize: 14, lineHeight: 20, flex: 1 }}>
              This replaces the identity on this phone. Every server you joined with the
              current one stops recognising you — those memberships are not deleted, they
              just stop being reachable from here.
            </Text>
          </View>

          <TextInput
            value={entry}
            onChangeText={(next) => {
              setEntry(next);
              setRestoreError(null);
              setRestored(false);
            }}
            placeholder="Your twenty-four words, separated by spaces"
            placeholderTextColor={theme.color.muted}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Your twenty-four words"
            style={{
              minHeight: 110,
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: restoreError ? theme.color.danger : theme.color.border,
              padding: theme.space(3),
              color: theme.color.text,
              fontSize: 16,
              textAlignVertical: "top",
            }}
          />

          {restoreError ? (
            <Text style={{ color: theme.color.danger, fontSize: 14, lineHeight: 20 }}>
              {restoreError}
            </Text>
          ) : null}

          {restored ? (
            <Text style={{ color: theme.color.success, fontSize: 14, lineHeight: 20 }}>
              Restored. Rejoin a server to use it.
            </Text>
          ) : null}

          <Action
            label="Restore"
            danger
            onPress={() => {
              try {
                const seed = wordsToSeed(entry);
                void restoreSeed(seed).then(() => {
                  setWords(seedToWords(seed));
                  setRevealed(false);
                  setEntry("");
                  setRestored(true);
                });
              } catch (err) {
                setRestoreError(err instanceof Error ? err.message : String(err));
              }
            }}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function Action({
  label,
  onPress,
  primary,
  danger,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  const theme = useTheme();
  const bg = primary ? theme.color.accent : danger ? theme.color.danger : theme.color.surfaceRaised;
  const fg = primary ? theme.color.onAccent : danger ? theme.color.onDanger : theme.color.text;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        paddingVertical: theme.space(4),
        borderRadius: theme.radius.full,
        alignItems: "center",
        backgroundColor: bg,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ color: fg, fontSize: 17, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}
