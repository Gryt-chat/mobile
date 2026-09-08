import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text, useTheme } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";

import { audioSessionState, type AudioSessionState } from "../../modules/audio-route";
import { barHeight, type Verdict } from "./micTest";
import { useMicCheck } from "./useMicCheck";

/**
 * Does this phone hear you, and does what it hears leave the phone — two questions that
 * look the same from inside a call. It joins nothing (GRYT-943).
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

        <SessionReadout />

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
 * The bars, oldest on the left, so speaking pushes a shape across the row. Every bar
 * keeps a visible floor: a row that empties to nothing reads as broken.
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
 * The sentence, and the number behind it. The byte count is the thing worth pasting
 * into a report — a counter at zero is the evidence for "sent nothing".
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

/**
 * What the audio session is doing, read on demand rather than live, so known moments can
 * be compared. `defaultToSpeaker` decides whether the picker can leave the loudspeaker.
 */
function SessionReadout() {
  const theme = useTheme();
  const [state, setState] = useState<AudioSessionState | null>(null);
  const [read, setRead] = useState(false);

  const take = useCallback(() => {
    setState(audioSessionState());
    setRead(true);
  }, []);

  return (
    <View style={{ gap: theme.space(2) }}>
      <Text style={{ color: theme.color.muted, fontSize: 13, fontWeight: "600" }}>
        AUDIO SESSION
      </Text>

      <Button tone="neutral" onPress={take}>
        Read the audio session
      </Button>

      {read && !state ? (
        <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 19 }}>
          This build has no audio session to read. That is every platform but
          iOS.
        </Text>
      ) : null}

      {state ? (
        <View
          style={{
            gap: theme.space(1),
            padding: theme.space(3),
            borderRadius: theme.radius.lg,
            backgroundColor: theme.color.surfaceRaised,
            borderWidth: 1,
            borderColor: theme.color.border,
          }}
        >
          <Line label="Category" value={state.category} />
          <Line label="Mode" value={state.mode} />
          <Line label="Options" value={state.options.join(", ") || "none"} />
          <Line label="Output" value={state.outputs.join(", ") || "none"} />
          <Line label="Input" value={state.inputs.join(", ") || "none"} />
          <Line label="WebRTC session active" value={state.webRTCActive ? "yes" : "no"} />
        </View>
      ) : null}

      <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 19 }}>
        Read it three times and compare: before joining a call, while in one,
        and after picking a different output. During a call the category should
        say playAndRecord. If it does not, or if the output goes back to the
        speaker on its own, that is the bug rather than your phone.
      </Text>
    </View>
  );
}

/** One row of the readout. Monospace so the values line up when pasted. */
function Line({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: theme.space(2) }}>
      <Text style={{ color: theme.color.muted, fontSize: 12, width: 132 }}>{label}</Text>
      <Text
        style={{ color: theme.color.text, fontSize: 12, flex: 1, fontFamily: "monospace" }}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}
