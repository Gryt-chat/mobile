import { useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Accordion,
  Alert,
  Button,
  Chip,
  Spinner,
  Surface,
  Switch,
  Text,
  TextField,
  useTheme,
} from "@gryt/ui-native";
import { BugIcon } from "phosphor-react-native/src/icons/Bug";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { LightbulbIcon } from "phosphor-react-native/src/icons/Lightbulb";

import { useDiagnostics } from "./useDiagnostics";
import {
  buildReport,
  describeAttached,
  MESSAGE_MAX,
  type Report,
  type ReportType,
} from "@gryt/core";
import { recentLogs } from "./logs";
import { reportLook } from "./reportLook";
import { SubmitError, submitReport } from "./submit";
import { PageHeader, Wash } from "../ui/PageHeader";

/** What kind of feedback, sent as the report's title so it can be sorted without reading it. */
const KINDS = ["An idea", "In the way", "Something I liked"] as const;

/**
 * Telling us something went wrong, or anything else. Same words as the desktop form, and
 * each type in its own colour so the two don't read as one screen (GRYT-1709).
 */
export function ReportScreen({ type }: { type: ReportType }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const diagnostics = useDiagnostics();
  const look = reportLook(type, theme);

  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number] | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // Captured when the switch goes on, so what's reviewed is what's posted.
  const [logs, setLogs] = useState<string[] | null>(null);

  const bug = type === "bug";
  const trimmed = message.trim();
  const Icon = bug ? BugIcon : LightbulbIcon;

  /* Built as you type, because it is also what the attached list is drawn
   * from — the two cannot disagree that way. */
  const report = useMemo(
    () => buildReport(type, { message, title: kind ?? undefined }, { ...diagnostics, logs: logs ?? undefined }),
    [type, message, kind, diagnostics, logs],
  );
  const attached = useMemo(() => describeAttached(report), [report]);

  const send = async () => {
    setSending(true);
    setProblem(null);
    try {
      await submitReport(report);
      setSent(true);
    } catch (error) {
      // The message stays in the box. Nobody types three paragraphs twice.
      setProblem(
        error instanceof SubmitError
          ? error.message
          : "That did not send. Your connection, or ours.",
      );
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
        <PageHeader title={look.title} tint={look.colour} />
        <View style={{ flex: 1, justifyContent: "center", gap: theme.space(4), padding: theme.space(6), paddingBottom: insets.bottom + theme.space(6) }}>
          <Tile colour={look.colour} size={64}>
            <CheckIcon size={30} color={look.colour} weight="bold" />
          </Tile>
          <Text style={{ color: theme.color.text, fontSize: 26, fontWeight: "800" }}>
            {bug ? "Bug report received" : "Feedback received"}
          </Text>
          <Text style={{ color: theme.color.muted, fontSize: 16, lineHeight: 24 }}>
            {bug
              ? "Thanks for your bug report, we greatly appreciate it."
              : "Thanks for your feedback, we greatly appreciate it."}
          </Text>
          <Button tone="primary" size="large" onPress={() => router.back()} style={{ marginTop: theme.space(3) }}>
            Done
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <PageHeader title={look.title} tint={look.colour} />

      <ScrollView
        contentContainerStyle={{ padding: theme.space(4), gap: theme.space(5), paddingBottom: insets.bottom + theme.space(6) }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
          <Tile colour={look.colour} size={44}>
            <Icon size={22} color={look.colour} weight="fill" />
          </Tile>
          <Text style={{ flex: 1, color: theme.color.muted, fontSize: 15, lineHeight: 21 }}>
            {bug
              ? "What happened, and what you were doing when it did."
              : "Something missing, something in the way, something you liked."}
          </Text>
        </View>

        {bug ? null : (
          <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space(2) }}>
            {KINDS.map((k) => (
              <Pressable
                key={k}
                onPress={() => setKind(kind === k ? null : k)}
                accessibilityRole="radio"
                accessibilityState={{ checked: kind === k }}
                hitSlop={6}
              >
                <Chip label={k} tone={kind === k ? "success" : "neutral"} variant={kind === k ? "soft" : "outline"} />
              </Pressable>
            ))}
          </View>
        )}

        <TextField
          value={message}
          onChangeText={(text) => {
            setMessage(text);
            setProblem(null);
          }}
          placeholder={bug ? "The call dropped when I switched to cellular…" : "I wish I could…"}
          multiline
          minRows={6}
          maxLength={MESSAGE_MAX}
          autoFocus
          accessibilityLabel={bug ? "What happened" : "Your feedback"}
        />

        <Attached
          lines={attached}
          report={report}
          includeLogs={logs !== null}
          onIncludeLogs={(on) => setLogs(on ? recentLogs() : null)}
        />

        {problem ? <Alert severity="error">{problem}</Alert> : null}

        <Button
          tone="primary"
          size="large"
          disabled={!trimmed || sending}
          onPress={() => void send()}
          startIcon={sending ? <Spinner size="small" color={theme.color.onAccent} /> : undefined}
        >
          {sending ? "Sending…" : bug ? "Send report" : "Send feedback"}
        </Button>
      </ScrollView>
    </View>
  );
}

/** The type's icon on a wash of its colour, which reads on a light theme and a dark one. */
function Tile({ colour, size, children }: { colour: string; size: number; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: theme.radius.full,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        backgroundColor: theme.color.surface,
      }}
    >
      <Wash colour={colour} strength={0.2} />
      {children}
    </View>
  );
}

/**
 * Everything that goes with what they wrote — not a disclosure notice, not a consent
 * gate. Closed: ten rows of diagnostics above the send button is a wall.
 */
function Attached({
  lines,
  report,
  includeLogs,
  onIncludeLogs,
}: {
  lines: { label: string; value: string }[];
  report: Report;
  includeLogs: boolean;
  onIncludeLogs: (on: boolean) => void;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.space(2) }}>
      <Surface bordered radius="lg" style={{ paddingHorizontal: theme.space(3) }}>
        <Accordion.Root type="single">
          <Accordion.Item value="attached">
            <Accordion.Trigger>
              <Text style={{ color: theme.color.text, fontSize: 15 }}>
                What gets sent with this
              </Text>
            </Accordion.Trigger>
            <Accordion.Panel style={{ gap: theme.space(2) }}>
              {lines.map((line) => (
                <View
                  key={line.label}
                  style={{ flexDirection: "row", alignItems: "baseline", gap: theme.space(3) }}
                >
                  <Text style={{ color: theme.color.muted, fontSize: 13, width: 116 }}>
                    {line.label}
                  </Text>
                  <Text
                    style={{ color: theme.color.text, fontSize: 13, flex: 1 }}
                    numberOfLines={1}
                  >
                    {line.value}
                  </Text>
                </View>
              ))}
            </Accordion.Panel>
          </Accordion.Item>
          {/* The list above is a summary, and a summary is a claim about the
              payload. This is the payload — the same object that gets posted,
              not a second one built for display, so the two cannot disagree.
              `Accordion.Item`'s bottom border would draw a line under the last
              thing in the card, hence the override on this one only. */}
          <Accordion.Item value="raw" style={{ borderBottomWidth: 0 }}>
            <Accordion.Trigger>
              <Text style={{ color: theme.color.text, fontSize: 15 }}>
                Read the exact data
              </Text>
            </Accordion.Trigger>
            <Accordion.Panel>
              <ScrollView
                horizontal
                style={{ maxHeight: 260 }}
                contentContainerStyle={{ paddingBottom: theme.space(2) }}
              >
                <Text
                  selectable
                  /* Atkinson Hyperlegible Mono, the desktop's code face. This used to
                     reach for Menlo, because the app had no mono face of its own. */
                  mono
                  style={{
                    color: theme.color.text,
                    fontSize: 11,
                    lineHeight: 16,
                  }}
                >
                  {JSON.stringify(report, null, 2)}
                </Text>
              </ScrollView>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      </Surface>
      <Surface bordered radius="lg" style={{ padding: theme.space(3), gap: theme.space(2) }}>
        <Switch
          checked={includeLogs}
          onCheckedChange={onIncludeLogs}
          label={<Text style={{ color: theme.color.text, fontSize: 15, fontWeight: "600", flex: 1 }}>Include the app’s recent log</Text>}
          accessibilityLabel="Include the app's recent log"
        />
        <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 18 }}>
          It makes a bug far easier to find, and it can contain personal information. A failed
          connection records the address of the server, which for a self-hosted one is often a
          home address.
        </Text>
      </Surface>
      {/* Accurate rather than reassuring, and it changes with the switch. A server's
          version is a number about software; its address isn't. */}
      <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 18 }}>
        {includeLogs
          ? "No messages and no names. The log may name servers you connect to."
          : "No messages, no names, and nothing about who you talk to."}
      </Text>
    </View>
  );
}
