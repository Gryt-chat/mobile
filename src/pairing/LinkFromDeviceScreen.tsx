import { router } from "expo-router";
import type { PairingEmoji } from "@gryt/crypto";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Alert, Button, Progress, Spinner, Text, useTheme } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";

import { useGrytAccount } from "../account/AccountProvider";
import { DEFAULT_IDENTITY_URL, normalizeAuthUrl } from "../account/authServer";
import { useServers } from "../servers/store";
import { commitLink } from "./commit";
import { PHONE_DEVICE_INFO } from "./device";
import { mlsDeviceOn, phoneLinkStores } from "./linkStores";
import { createPhoneNewDevice, type PhoneNewDevice, type PhoneNewDeviceState } from "./newDevice";
import { newDeviceEndText, renewedText, REPLACES_IDENTITY, SCAN_THIS } from "./newDeviceWords";
import { createPairingOidc } from "./oidc";
import { QrCode } from "./QrCode";
import { pairingFetch, phoneRelay } from "./relay";

/**
 * Link this phone from a device you already use (GRYT-1484): show a QR and a code, compare
 * the emoji, then take the seed, the servers and the account. Nothing is kept until the end.
 */
export function LinkFromDeviceScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { link, state, restart } = useLink();

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
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700" }}>Link this device</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.space(4), paddingBottom: insets.bottom + theme.space(6), gap: theme.space(5) }}>
        <Step link={link} state={state} restart={restart} />
      </ScrollView>
    </View>
  );
}

/** One link per attempt. Leaving the screen cancels one that hasn't written anything yet. */
function useLink() {
  const account = useGrytAccount();
  const servers = useServers();
  const react = useRef({ adoptTokens: account.adoptTokens, join: servers.join, recordNickname: servers.recordNickname });
  react.current = { adoptTokens: account.adoptTokens, join: servers.join, recordNickname: servers.recordNickname };

  const make = (): PhoneNewDevice => {
    const { origin, relay } = phoneRelay();
    const own = normalizeAuthUrl(origin) !== DEFAULT_IDENTITY_URL;
    return createPhoneNewDevice({
      relay,
      relayOrigin: own ? origin : undefined,
      device: PHONE_DEVICE_INFO,
      oidc: createPairingOidc(pairingFetch),
      commit: (envelope, tokens) =>
        commitLink(
          envelope,
          tokens,
          phoneLinkStores({
            adoptTokens: (t) => react.current.adoptTokens(t),
            join: (host, info) => react.current.join(host, info),
            recordNickname: (host, nickname) => react.current.recordNickname(host, nickname),
          }),
        ),
      deviceOn: mlsDeviceOn,
    });
  };

  const [link, setLink] = useState(make);
  const [state, setState] = useState<PhoneNewDeviceState>(link.state);

  useEffect(() => {
    setState(link.state);
    const unsubscribe = link.subscribe(setState);
    if (link.state.pairing.phase === "idle") link.start();
    return () => {
      unsubscribe();
      if (!link.state.committed && link.state.pairing.phase !== "ended") void link.cancel();
    };
  }, [link]);

  return { link, state, restart: () => setLink(make()) };
}

function Step({ link, state, restart }: { link: PhoneNewDevice; state: PhoneNewDeviceState; restart: () => void }) {
  const pairing = state.pairing;

  if (state.committed) {
    if (pairing.phase === "joining") {
      const joined = state.joined;
      return (
        <Busy
          title={joined ? `Connecting to your servers: ${joined.done} of ${joined.total}.` : "Connecting to your servers…"}
          value={joined && joined.total ? (joined.done / joined.total) * 100 : undefined}
        />
      );
    }
    const from = "from" in pairing ? pairing.from : null;
    return <Linked from={from} />;
  }

  switch (pairing.phase) {
    case "idle":
    case "opening":
      return <Busy title="Getting a code…" />;
    case "showing":
      return <Showing qr={pairing.qr} code={pairing.code} renewed={renewedText(pairing.renewed)} cancel={() => void link.cancel()} />;
    case "comparing":
      return <Comparing emoji={pairing.emoji} link={link} />;
    case "signing_in":
      return <Busy title={`Signing in as ${pairing.username}…`} />;
    case "ended":
      return <Ended text={newDeviceEndText(pairing.reason)} restart={restart} />;
    default:
      return null;
  }
}

function Showing({ qr, code, renewed, cancel }: { qr: string; code: string; renewed: string | null; cancel: () => void }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { servers } = useServers();
  const size = Math.min(width - theme.space(8), 320);

  return (
    <View style={{ gap: theme.space(4) }}>
      <Paragraph>{SCAN_THIS}</Paragraph>
      <View style={{ alignItems: "center" }}>
        <View style={{ padding: theme.space(2), borderRadius: theme.radius.lg, backgroundColor: "#ffffff" }}>
          <QrCode value={qr} size={size} label="Code to scan from your other device" />
        </View>
      </View>
      <View style={{ alignItems: "center", gap: theme.space(1) }}>
        <Paragraph>Or type this code there:</Paragraph>
        <Text
          selectable
          accessibilityLabel={`Code ${code.split("").join(" ")}`}
          style={{ color: theme.color.text, fontSize: 28, letterSpacing: 2, ...theme.font("700", { mono: true }) }}
        >
          {code}
        </Text>
      </View>
      {renewed ? <Paragraph>{renewed}</Paragraph> : null}
      {servers.length > 0 ? <Alert severity="warning">{REPLACES_IDENTITY}</Alert> : null}
      <Button tone="ghost" onPress={cancel}>
        Cancel
      </Button>
    </View>
  );
}

function Comparing({ emoji, link }: { emoji: readonly PairingEmoji[]; link: PhoneNewDevice }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space(4) }}>
      <Paragraph>Approve on your other device if it shows the same four.</Paragraph>
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
      <View style={{ gap: theme.space(2) }}>
        <Button tone="neutral" onPress={() => void link.mismatch()}>
          They don't match
        </Button>
        <Button tone="ghost" onPress={() => void link.cancel()}>
          Cancel
        </Button>
      </View>
    </View>
  );
}

function Linked({ from }: { from: string | null }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space(4), alignItems: "center" }}>
      <CheckCircleIcon size={48} color={theme.color.success} weight="fill" />
      <Text style={{ color: theme.color.text, fontSize: 17, fontWeight: "600", textAlign: "center" }}>
        {from ? `Linked from ${from}.` : "This phone is linked."}
      </Text>
      <Button onPress={() => router.replace("/")}>Done</Button>
    </View>
  );
}

function Ended({ text, restart }: { text: string | null; restart: () => void }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space(3) }}>
      {text ? <Alert severity="error">{text}</Alert> : <Paragraph>Nothing was kept.</Paragraph>}
      <Button onPress={restart}>Try again</Button>
      <Button tone="ghost" onPress={() => router.back()}>
        Close
      </Button>
    </View>
  );
}

function Busy({ title, value }: { title: string; value?: number }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space(3), alignItems: "center", paddingVertical: theme.space(6) }}>
      {value === undefined ? <Spinner size="large" /> : <Progress value={value} style={{ alignSelf: "stretch" }} />}
      <Paragraph>{title}</Paragraph>
    </View>
  );
}

function Paragraph({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={{ color: theme.color.muted, fontSize: 15, lineHeight: 21, textAlign: "center" }}>{children}</Text>;
}
