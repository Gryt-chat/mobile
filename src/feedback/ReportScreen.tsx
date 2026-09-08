import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Accordion,
  Alert,
  Button,
  Spinner,
  Surface,
  Text,
  TextField,
  useTheme,
  useToast,
} from "@gryt/ui-native";
import { BugIcon } from "phosphor-react-native/src/icons/Bug";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { HeartIcon } from "phosphor-react-native/src/icons/Heart";

import { useDiagnostics } from "./useDiagnostics";
import {
  buildReport,
  describeAttached,
  MESSAGE_MAX,
  type Report,
  type ReportType,
} from "@gryt/core";
import { SubmitError, submitReport } from "./submit";

/**
 * Telling us something went wrong, or telling us anything else. **One screen, two
 * labels**, which is the call the service made too. **What is attached is on the
 * screen**, in the words a person would use. **Sending closes it and raises a toast.**
 */
export function ReportScreen({ type }: { type: ReportType }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const diagnostics = useDiagnostics();
  const toast = useToast();

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const bug = type === "bug";
  const trimmed = message.trim();

  /* Built as you type, because it is also what the attached list is drawn
   * from — the two cannot disagree that way. */
  const report = useMemo(
    () => buildReport(type, { message }, diagnostics),
    [type, message, diagnostics],
  );
  const attached = useMemo(() => describeAttached(report), [report]);

  const send = async () => {
    setSending(true);
    setProblem(null);
    try {
      await submitReport(report);
      /* Out of the way first, then say so. The toast is raised over whatever
       * they were doing before the form, which is where they wanted to be. */
      router.back();
      toast.show({
        title: bug ? "Bug report received" : "Feedback received",
        severity: "success",
      });
    } catch (error) {
      setProblem(
        error instanceof SubmitError
          ? error.message
          : "That did not send. Your connection, or ours.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <Header
        title={bug ? "Report a bug" : "Give feedback"}
        insetTop={insets.top}
      />

      <ScrollView
        contentContainerStyle={{ padding: theme.space(4), gap: theme.space(5) }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={{ flexDirection: "row", gap: theme.space(3) }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: theme.radius.full,
              backgroundColor: theme.color.surfaceRaised,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {bug ? (
              <BugIcon size={22} color={theme.color.text} weight="fill" />
            ) : (
              <HeartIcon size={22} color={theme.color.text} weight="fill" />
            )}
          </View>
          <Text
            style={{
              flex: 1,
              color: theme.color.muted,
              fontSize: 15,
              lineHeight: 21,
            }}
          >
            {bug
              ? "What happened, and what you were doing when it did."
              : "Something missing, something in the way, something you liked."}
          </Text>
        </View>

        <TextField
          value={message}
          onChangeText={setMessage}
          placeholder={
            bug
              ? "The call dropped when I switched to cellular…"
              : "I wish I could…"
          }
          multiline
          minRows={6}
          maxLength={MESSAGE_MAX}
          autoFocus
          accessibilityLabel={bug ? "What happened" : "Your feedback"}
        />

        <Attached lines={attached} report={report} />

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

/**
 * Everything that goes with what they wrote, in the words a person would use — not a
 * disclosure notice and not a consent gate. **Closed, with the sentence outside it**:
 * ten rows of diagnostics between the message and the send button is a wall.
 */
function Attached({
  lines,
  report,
}: {
  lines: { label: string; value: string }[];
  report: Report;
}) {
  const theme = useTheme();

  if (lines.length === 0) return null;

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
      <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 18 }}>
        {/* Accurate rather than reassuring. A server's *version* does go, when
            there is one — that is a number about the software, not about the
            people on it, and claiming "nothing from your servers" while sending
            it would be the kind of privacy line that is worth less than none. */}
        No messages, no names, and nothing about who you talk to.
      </Text>
    </View>
  );
}

/** The same hand-rolled header the other pushed screens have. */
function Header({ title, insetTop }: { title: string; insetTop: number }) {
  const theme = useTheme();

  return (
    <View
      style={{
        paddingTop: insetTop + theme.space(1),
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
        {title}
      </Text>
    </View>
  );
}
