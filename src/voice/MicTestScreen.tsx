import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text, useTheme } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";

import { barHeight, type Verdict } from "./micTest";
import { useMicCheck } from "./useMicCheck";

/**
 * Does this phone hear you, and does what it hears leave the phone.
 *
 * Two questions rather than one, because from inside a call they look the same
 * — nobody can hear you — and they are fixed in different places. GRYT-943 was
 * reported as "it cannot capture the mic" and the capture code turned out not
 * to have changed in either of the releases around it.
 *
 * It does not join anything. The microphone is opened here and sent to a second
 * connection on this phone, so a green result rules the device out: the phone
 * can capture, encode and send, and a call that is silent anyway is Gryt's
 * fault rather than the hardware's or the permission's.
 */
export function MicTestScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [running, setRunning] = useState(true);
  const { history, verdict, bytesSent } = useMicCheck(running);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      {/* The hand-rolled header the other root screens have — the root Stack
          runs with headerShown: false, so a screen owns its own top. */}
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
          Microphone test
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.space(4), gap: theme.space(4) }}>
        <Meter history={history} verdict={verdict} />
        <Reading verdict={verdict} bytesSent={bytesSent} />

        <Button tone="neutral" onPress={() => setRunning((on) => !on)}>
          {running ? "Stop" : "Start again"}
        </Button>

        <View style={{ gap: theme.space(2) }}>
          <Text style={{ color: theme.color.muted, fontSize: 13, fontWeight: "600" }}>
            WHAT THIS IS
          </Text>
          <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 19 }}>
            The bars are how loud the microphone is, over the last couple of
            seconds. They are a level and not an equaliser — a phone does not run
            the audio graph the desktop app does, so there is no spectrum to
            draw.
          </Text>
          <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 19 }}>
            Underneath, it checks that what the microphone hears is actually
            being encoded and sent, to a connection that goes no further than
            this phone. Nothing is recorded and nothing reaches a server.
          </Text>
          <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 19 }}>
            If this says the microphone works and calls are still silent, the
            fault is in Gryt rather than in the phone or the permission — which
            is worth saying in the bug report.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

/** What each verdict looks like. Green only when both halves are working. */
function toneOf(verdict: Verdict, theme: ReturnType<typeof useTheme>): string {
  switch (verdict.state) {
    case "working":
      return theme.color.success;
    case "blocked":
      return theme.color.danger;
    case "not-sending":
    case "silent":
      return theme.color.warning;
    default:
      return theme.color.muted;
  }
}

/**
 * The bars.
 *
 * Oldest on the left, so speaking pushes a shape across the row rather than
 * making one bar twitch. Every bar keeps a visible floor when it is silent:
 * a row that empties to nothing reads as broken, and this screen has a separate
 * sentence for broken.
 */
function Meter({ history, verdict }: { history: number[]; verdict: Verdict }) {
  const theme = useTheme();
  const colour = toneOf(verdict, theme);

  return (
    <View
      style={{
        height: 140,
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 3,
        padding: theme.space(3),
        borderRadius: theme.radius.lg,
        backgroundColor: theme.color.surfaceRaised,
        borderWidth: 1,
        borderColor: theme.color.border,
      }}
      accessibilityRole="progressbar"
      accessibilityLabel="Microphone level"
    >
      {history.map((level, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            height: `${Math.max(2, barHeight(level) * 100)}%`,
            borderRadius: 2,
            backgroundColor: level > 0 ? colour : theme.color.border,
          }}
        />
      ))}
    </View>
  );
}

/**
 * The sentence, and the number behind it.
 *
 * The byte count is here because it is the thing worth pasting into a report:
 * "heard you, sent nothing" is a claim, and a counter sitting at zero is the
 * evidence for it.
 */
function Reading({ verdict, bytesSent }: { verdict: Verdict; bytesSent: number | null }) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.space(2) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2) }}>
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: theme.radius.full,
            backgroundColor: toneOf(verdict, theme),
          }}
        />
        <Text style={{ color: theme.color.text, fontSize: 15, flex: 1, lineHeight: 21 }}>
          {verdict.message}
        </Text>
      </View>
      <Text style={{ color: theme.color.muted, fontSize: 12 }}>
        {bytesSent === null ? "Nothing sent yet" : `${bytesSent.toLocaleString()} bytes sent`}
      </Text>
    </View>
  );
}
