import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import type { PairingEmoji } from "@gryt/crypto";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Alert, Button, Progress, Spinner, Text, TextField, useTheme } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";

import type { HistoryProgress } from "@gryt/core";

import { useGrytAccount } from "../account/AccountProvider";
import { getLocalArchiveSnapshot, openLocalArchive } from "../archive/localArchive";
import { identityScopeFor } from "../identity/scope";
import { sessionAddingDevicesOn, sessionOn } from "../mls/registry";
import { useServers } from "../servers/store";
import { adoptApprover, approverInFlight } from "./activeApprover";
import { createPhoneApprover, endReasonOf, isInFlight, type PhoneApprover, type PhoneApproverState } from "./approver";
import { collectEnvelope } from "./collectEnvelope";
import { deviceLimitLines, ownDeviceCounts } from "./deviceLimit";
import { markLinkedHere } from "./deviceNotices";
import { historyArchiveOf } from "./historyArchive";
import { formatCodeInput, isCompleteCode } from "./input";
import { adderMarkingKnown } from "./newDeviceNotice";
import { confirmOwner } from "./ownerCheck";
import { pairingFetch, phoneRelay } from "./relay";
import { Scanner } from "./Scanner";
import { approverEndText, deviceLine, locationLine, secondsLeft, sendingHistoryText, sentHistoryText } from "./words";

/** The archive as core reads it, only when it's open: no archive means no history, not no link. */
function openArchiveHistory() {
  if (getLocalArchiveSnapshot().status.kind !== "open") return undefined;
  return historyArchiveOf({
    conversations: async () => (await openLocalArchive()).messages.conversations(),
    rows: async (...args) => (await openLocalArchive()).messages.rows(...args),
  });
}

/**
 * Link a new device from this phone (GRYT-1484): scan its code or type it, check the emoji,
 * approve behind Face ID, then watch it get added to your DMs. Worded as the desktop's.
 */
export function LinkDeviceScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { approver, state, restart } = useApprover();

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
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700" }}>Link a device</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: theme.space(4), paddingBottom: insets.bottom + theme.space(6), gap: theme.space(5) }}
        keyboardShouldPersistTaps="handled"
      >
        <Step approver={approver} state={state} restart={restart} />
      </ScrollView>
    </View>
  );
}

/** One approver per attempt, since core's machines don't restart. Leaving before Approve cancels it; after, it carries on. */
function useApprover() {
  const { state: accountState, refreshAccessToken } = useGrytAccount();
  const { servers } = useServers();
  const latest = useRef({ servers, profile: accountState.status === "signedIn" ? accountState.profile : null });
  latest.current = { servers, profile: accountState.status === "signedIn" ? accountState.profile : null };

  const make = useCallback((): PhoneApprover => {
    const { origin, relay } = phoneRelay();
    const approver = createPhoneApprover({
      relay,
      relayOrigin: origin,
      fetch: pairingFetch,
      devices: adderMarkingKnown(sessionAddingDevicesOn, identityScopeFor, markLinkedHere),
      confirmOwner,
      collectEnvelope: () => collectEnvelope(latest.current.servers, latest.current.profile),
      refreshAccessToken,
      history: openArchiveHistory(),
    });
    adoptApprover(approver);
    return approver;
  }, [refreshAccessToken]);

  const [approver, setApprover] = useState(() => approverInFlight() ?? make());
  const [state, setState] = useState<PhoneApproverState>(approver.state);

  useEffect(() => {
    setState(approver.state);
    const unsubscribe = approver.subscribe(setState);
    return () => {
      unsubscribe();
      const phase = approver.state.pairing.phase;
      if (phase !== "idle" && phase !== "done" && phase !== "ended" && !isInFlight(phase)) void approver.cancel();
    };
  }, [approver]);

  return { approver, state, restart: () => setApprover(make()) };
}

function Step({ approver, state, restart }: { approver: PhoneApprover; state: PhoneApproverState; restart: () => void }) {
  const pairing = state.pairing;
  const ended = endReasonOf(state);
  if (ended) return <EndStep reason={ended} restart={restart} />;

  switch (pairing.phase) {
    case "idle":
      return <EntryStep onClaim={(input) => approver.claim(input)} />;
    case "claiming":
    case "waiting":
      return <Waiting title="Connecting to the new device…" />;
    case "confirming":
      return <ConfirmStep approver={approver} state={state} />;
    case "signing_in":
      return <Waiting title={`Signing in ${pairing.device.name}…`} />;
    case "browser":
      return <BrowserStep url={pairing.url} />;
    case "waiting_ready":
      return <Waiting title={`Waiting for ${pairing.device.name} to connect to your servers…`} />;
    case "adding":
      return <AddingStep name={pairing.device.name} done={pairing.done} total={pairing.total} />;
    case "sending":
      return <SendingStep history={state.history} />;
    case "done":
      return <DoneStep name={pairing.device.name} history={state.history} />;
    default:
      return null;
  }
}

function EntryStep({ onClaim }: { onClaim: (input: { qr: string } | { code: string }) => void }) {
  const theme = useTheme();
  const [typing, setTyping] = useState(false);
  const [code, setCode] = useState("");

  return (
    <View style={{ gap: theme.space(4) }}>
      <Paragraph>
        On the new device, choose Link from another device. It shows a code to scan, and a short code
        under it you can type instead.
      </Paragraph>
      {typing ? (
        <View style={{ gap: theme.space(3) }}>
          <TextField
            label="Code"
            value={code}
            onChangeText={(text) => setCode(formatCodeInput(text))}
            placeholder="XXXX-XXXX"
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={() => isCompleteCode(code) && onClaim({ code })}
          />
          <Button disabled={!isCompleteCode(code)} onPress={() => onClaim({ code })}>
            Continue
          </Button>
          <Button tone="ghost" onPress={() => setTyping(false)}>
            Scan a code instead
          </Button>
        </View>
      ) : (
        <View style={{ gap: theme.space(3) }}>
          <Scanner onCode={(qr) => onClaim({ qr })} />
          <Button tone="ghost" onPress={() => setTyping(true)}>
            Type a code instead
          </Button>
        </View>
      )}
    </View>
  );
}

function ConfirmStep({ approver, state }: { approver: PhoneApprover; state: PhoneApproverState }) {
  const theme = useTheme();
  const pairing = state.pairing;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (pairing.phase !== "confirming") return null;
  const left = secondsLeft(pairing.deadline, now);

  return (
    <View style={{ gap: theme.space(4) }}>
      <View style={{ gap: theme.space(1) }}>
        <Text style={{ color: theme.color.text, fontSize: 22, fontWeight: "700" }}>Link this device?</Text>
        <Text style={{ color: theme.color.text, fontSize: 17, fontWeight: "600" }}>{pairing.device.name || "Unnamed device"}</Text>
        <Paragraph>{deviceLine(pairing.device)}</Paragraph>
        <Paragraph>{locationLine(pairing.location, pairing.yourLocation)}</Paragraph>
      </View>

      <EmojiRow emoji={pairing.emoji} />

      <DeviceLimitWarning />

      <Alert severity="warning">
        This device gets your messages, your keys and your account. Only approve a device that's in front
        of you, and only if it shows the same emoji. Gryt never asks you to scan a code from somebody
        else's device or a website.
      </Alert>

      {state.ownerRefused ? (
        <Text accessibilityLiveRegion="polite" style={{ color: theme.color.danger, fontSize: 14 }}>
          That didn't unlock. Try Approve again.
        </Text>
      ) : null}

      <View style={{ gap: theme.space(2) }}>
        <Button disabled={state.approving || left === 0} onPress={() => void approver.approve()}>
          {state.approving ? "Approving…" : `Approve (${left})`}
        </Button>
        <Button tone="neutral" disabled={state.approving} onPress={() => void approver.deny()}>
          Deny
        </Button>
        <Button tone="ghost" disabled={state.approving} onPress={() => void approver.mismatch()}>
          They don't match
        </Button>
      </View>
    </View>
  );
}

/** The four emoji, each with its name under it for screen readers and look-alikes. */
function EmojiRow({ emoji }: { emoji: readonly PairingEmoji[] }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`Emoji: ${emoji.map((e) => e.name).join(", ")}`}
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        padding: theme.space(3),
        borderRadius: theme.radius.lg,
        backgroundColor: theme.color.surfaceRaised,
      }}
    >
      {emoji.map((e, i) => (
        <View key={i} style={{ flex: 1, alignItems: "center", gap: theme.space(1) }}>
          <Text style={{ fontSize: 40, lineHeight: 48 }}>{e.emoji}</Text>
          <Text style={{ color: theme.color.muted, fontSize: 13 }}>{e.name}</Text>
        </View>
      ))}
    </View>
  );
}

function BrowserStep({ url }: { url: string }) {
  const theme = useTheme();
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void WebBrowser.openBrowserAsync(url);
  }, [url]);
  return (
    <View style={{ gap: theme.space(3) }}>
      <Paragraph>Tap Yes in the browser, then come back here.</Paragraph>
      <Button tone="neutral" onPress={() => void WebBrowser.openBrowserAsync(url)}>
        Open the browser again
      </Button>
    </View>
  );
}

function AddingStep({ name, done, total }: { name: string; done: number; total: number }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space(3) }}>
      <Paragraph>{`Adding ${name} to your conversations: ${done} of ${total}.`}</Paragraph>
      <Progress value={total ? (done / total) * 100 : undefined} />
    </View>
  );
}

/** A server already holding five of your devices: the new one wouldn't get DMs there (GRYT-1575). */
function DeviceLimitWarning() {
  const theme = useTheme();
  const { servers } = useServers();
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    void ownDeviceCounts(servers, sessionOn).then((counts) => live && setLines(deviceLimitLines(counts)));
    return () => {
      live = false;
    };
  }, [servers]);
  if (lines.length === 0) return null;

  return (
    <View style={{ gap: theme.space(2) }}>
      {lines.map((line) => (
        <Alert key={line} severity="warning">
          {line}
        </Alert>
      ))}
      <Button tone="neutral" onPress={() => router.push("/devices")}>
        Your devices
      </Button>
    </View>
  );
}

function SendingStep({ history }: { history: HistoryProgress | null }) {
  const theme = useTheme();
  const total = history?.total ?? null;
  return (
    <View style={{ gap: theme.space(3) }}>
      <Paragraph>{sendingHistoryText(history)}</Paragraph>
      <Progress value={total ? Math.min(100, ((history?.messages ?? 0) / total) * 100) : undefined} />
    </View>
  );
}

function DoneStep({ name, history }: { name: string; history: HistoryProgress | null }) {
  const theme = useTheme();
  const sent = sentHistoryText(history);
  return (
    <View style={{ gap: theme.space(4), alignItems: "center" }}>
      <CheckCircleIcon size={48} color={theme.color.success} weight="fill" />
      <Text style={{ color: theme.color.text, fontSize: 17, fontWeight: "600", textAlign: "center" }}>
        {`${name} is linked.`}
      </Text>
      {sent ? <Paragraph>{sent}</Paragraph> : null}
      <Button onPress={() => router.back()}>Done</Button>
    </View>
  );
}

function EndStep({ reason, restart }: { reason: Parameters<typeof approverEndText>[0]; restart: () => void }) {
  const theme = useTheme();
  const text = approverEndText(reason);
  return (
    <View style={{ gap: theme.space(3) }}>
      {text ? <Alert severity="error">{text}</Alert> : <Paragraph>Nothing was sent.</Paragraph>}
      <Button onPress={restart}>Try again</Button>
      <Button tone="ghost" onPress={() => router.back()}>
        Close
      </Button>
    </View>
  );
}

function Waiting({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space(3), alignItems: "center", paddingVertical: theme.space(6) }}>
      <Spinner size="large" />
      <Paragraph>{title}</Paragraph>
    </View>
  );
}

function Paragraph({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={{ color: theme.color.muted, fontSize: 15, lineHeight: 21 }}>{children}</Text>;
}
