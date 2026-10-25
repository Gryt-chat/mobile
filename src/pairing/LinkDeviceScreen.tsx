import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import type { PairingEmoji } from "@gryt/crypto";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Alert, Button, Spinner, Text, TextField, useTheme } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";

import type { HistoryProgress, MlsOwnDevice } from "@gryt/core";

import { useGrytAccount } from "../account/AccountProvider";
import { getLocalArchiveSnapshot, openLocalArchive } from "../archive/localArchive";
import { identityScopeFor } from "../identity/scope";
import { sessionAddingDevicesOn, sessionOn } from "../mls/registry";
import { ownDeviceLabel, orderOwnDevices } from "../mls/ownDevices";
import { useServers } from "../servers/store";
import { useShell } from "../shell/ShellContext";
import { adoptApprover, approverInFlight } from "./activeApprover";
import { createPhoneApprover, endReasonOf, isInFlight, type PhoneApprover, type PhoneApproverState } from "./approver";
import { collectEnvelope } from "./collectEnvelope";
import { deviceLimitLines, ownDeviceCounts } from "./deviceLimit";
import { markLinkedHere } from "./deviceNotices";
import { historyArchiveOf } from "./historyArchive";
import { formatCodeInput, isCompleteCode, judgeScan, pairingQrFrom } from "./input";
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
  // Opened from the camera with the code already in the link: claim it, once, instead of asking to scan.
  const { qr } = useLocalSearchParams<{ qr?: string }>();
  const claimedFromLink = useRef(false);
  useEffect(() => {
    if (!qr || claimedFromLink.current || state.pairing.phase !== "idle" || judgeScan(qr) !== "claim") return;
    claimedFromLink.current = true;
    approver.claim({ qr });
  }, [qr, approver, state.pairing.phase]);

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
      return <SetupSteps name={pairing.device.name} adding={{ done: pairing.done, total: pairing.total }} history={state.history} />;
    case "sending":
      return <SetupSteps name={pairing.device.name} adding={null} history={state.history} />;
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
          <Scanner onCode={(qr) => onClaim({ qr: pairingQrFrom(qr) })} />
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

  const name = pairing.device.name || "device";

  return (
    <View style={{ gap: theme.space(4) }}>
      <View style={{ gap: theme.space(1), alignItems: "center" }}>
        <Text style={{ color: theme.color.text, fontSize: 26, fontWeight: "700", textAlign: "center" }}>{`Is this your ${name}?`}</Text>
        <Paragraph>{deviceLine(pairing.device)}</Paragraph>
        <Paragraph>{locationLine(pairing.location, pairing.yourLocation)}</Paragraph>
      </View>

      <Paragraph>{`Does your ${name} show the same four?`}</Paragraph>
      <EmojiRow emoji={pairing.emoji} />

      <DeviceLimitWarning />

      {state.ownerRefused ? (
        <Text accessibilityLiveRegion="polite" style={{ color: theme.color.danger, fontSize: 14 }}>
          That didn't unlock. Try Approve again.
        </Text>
      ) : null}

      <Text style={{ color: theme.color.muted, fontSize: 13, textAlign: "center" }}>
        Only approve a device you're holding right now. Gryt never asks you to scan a code from somebody
        else's screen or a website.
      </Text>

      <View style={{ gap: theme.space(2) }}>
        <Button disabled={state.approving || left === 0} onPress={() => void approver.approve()}>
          {state.approving ? "Approving…" : `Yes, approve (${left})`}
        </Button>
        <Button tone="neutral" disabled={state.approving} onPress={() => void approver.mismatch()}>
          No, they're different
        </Button>
        <Button tone="ghost" disabled={state.approving} onPress={() => void approver.deny()}>
          That's not my device
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

/** The whole setup as ticks, so it never looks stuck on one bar. */
function SetupSteps({ name, adding, history }: { name: string; adding: { done: number; total: number } | null; history: HistoryProgress | null }) {
  const theme = useTheme();
  const steps: { label: string; detail: string; state: "done" | "busy" | "todo" }[] = [
    { label: "Checked it's yours", detail: "The pictures matched", state: "done" },
    { label: "Gave it your key", detail: "So it can open your messages", state: "done" },
    {
      label: "Adding it to your chats",
      detail: adding ? `${adding.done} of ${adding.total}` : "Done",
      state: adding ? "busy" : "done",
    },
    { label: "Copying older messages", detail: adding ? "Next" : sendingHistoryText(history), state: adding ? "todo" : "busy" },
  ];
  return (
    <View style={{ gap: theme.space(4) }}>
      <View style={{ gap: theme.space(1), alignItems: "center" }}>
        <Text style={{ color: theme.color.text, fontSize: 24, fontWeight: "700", textAlign: "center" }}>{`Setting up your ${name}`}</Text>
        <Paragraph>Keep Gryt open on this phone until it's done.</Paragraph>
      </View>
      <View style={{ padding: theme.space(3), gap: theme.space(3), borderRadius: theme.radius.lg, backgroundColor: theme.color.surfaceRaised }}>
        {steps.map((step) => (
          <View key={step.label} style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
            {step.state === "done" ? <CheckCircleIcon size={22} color={theme.color.success} weight="fill" /> : null}
            {step.state === "busy" ? <Spinner size="small" /> : null}
            {step.state === "todo" ? <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: theme.color.border }} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={{ color: step.state === "todo" ? theme.color.muted : theme.color.text, fontSize: 15 }}>{step.label}</Text>
              <Text style={{ color: theme.color.muted, fontSize: 13 }}>{step.detail}</Text>
            </View>
          </View>
        ))}
      </View>
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


function DoneStep({ name, history }: { name: string; history: HistoryProgress | null }) {
  const theme = useTheme();
  const sent = sentHistoryText(history);
  // Your devices on this server, with ticks, so you can see the new one sits beside the rest.
  const host = useShell().server?.host ?? null;
  const [devices, setDevices] = useState<MlsOwnDevice[]>([]);
  useEffect(() => {
    let live = true;
    const session = host ? sessionOn(host) : null;
    void session?.ownDevices().then((list) => live && setDevices(orderOwnDevices(list))).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [host]);
  return (
    <View style={{ gap: theme.space(4), alignItems: "center" }}>
      <CheckCircleIcon size={56} color={theme.color.success} weight="fill" />
      <Text style={{ color: theme.color.text, fontSize: 24, fontWeight: "700", textAlign: "center" }}>
        {`Your ${name} is added`}
      </Text>
      <Paragraph>It has your key, your servers and your messages.</Paragraph>
      {sent ? <Paragraph>{sent}</Paragraph> : null}
      {devices.length > 0 ? (
        <View style={{ alignSelf: "stretch", padding: theme.space(3), gap: theme.space(2), borderRadius: theme.radius.lg, backgroundColor: theme.color.surfaceRaised }}>
          <Text style={{ color: theme.color.muted, fontSize: 13, fontWeight: "700" }}>YOUR DEVICES</Text>
          {devices.map((d) => (
            <View key={d.deviceId} style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2) }}>
              <CheckCircleIcon size={20} color={theme.color.success} weight="fill" />
              <Text style={{ flex: 1, color: theme.color.text, fontSize: 15 }}>{d.thisDevice ? "This phone" : ownDeviceLabel(d)}</Text>
            </View>
          ))}
        </View>
      ) : null}
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
