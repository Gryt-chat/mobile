import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Alert,
  Button,
  Spinner,
  Surface,
  Text,
  TextField,
  useTheme,
} from "@gryt/ui-native";
import { BroadcastIcon } from "phosphor-react-native/src/icons/Broadcast";
import { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";
import { LockIcon } from "phosphor-react-native/src/icons/Lock";
import { UsersThreeIcon } from "phosphor-react-native/src/icons/UsersThree";
import { XIcon } from "phosphor-react-native/src/icons/X";
import { ClipboardTextIcon } from "phosphor-react-native/src/icons/ClipboardText";

import { ServerIcon } from "./ServerIcon";
import { normalizeCode } from "./address";
import { rememberInviteCode } from "./inviteCodes";
import { joinSheetView } from "./joinSheet";
import { rememberPendingInvite } from "./pendingInvite";
import { useServers } from "./store";
import { useGrytAccount } from "../account/AccountProvider";
import { useShell } from "../shell/ShellContext";
import { type OfficialServer, useOfficialServer } from "./useOfficialServer";
import { useServerLookup, type LookupState } from "./useServerLookup";
import type { ServerInfo } from "./info";
import { useBackToClose } from "../ui/useBackToClose";
import { returnToTabs } from "../shell/returnToTabs";
import { lanDiscoveryAvailable } from "../../modules/lan-discovery";
import { useSheetInsets } from "../shell/useFold";

const JOIN_POLICY_LINE: Partial<Record<string, string>> = { open: "Anyone can join", request: "Joining needs approval" };

function addLabel(already: boolean, joining: boolean, add: string): string {
  if (already) return "Already added";
  return joining ? "Adding…" : add;
}

export interface AddServerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What an invite link filled in, if the sheet was opened by one. */
  initialInput?: string;
}

/**
 * The account, as the sheet needs it. Read outside the sheet like the server list is,
 * since the sheet's children render in another tree.
 */
interface SheetAccount {
  /** Undefined while the keychain is still being read. */
  signedIn: boolean | undefined;
  signingIn: boolean;
  signIn: () => Promise<void>;
}

/**
 * A card that sits just above the keyboard (A1 on the canvas), not a sheet: the sheet's
 * preview and button ended up under the keyboard. The card shrinks and scrolls instead.
 */
export function AddServerSheet({
  open,
  onOpenChange,
  initialInput,
}: AddServerSheetProps) {
  const { join, has } = useServers();
  const { setServer } = useShell();
  const { state, signIn } = useGrytAccount();
  /* A failed sign-in counts as signed out, so the button comes back for another go. */
  const account: SheetAccount = {
    signedIn: state.status === "loading" ? undefined : state.status === "signedIn",
    signingIn: state.status === "signingIn",
    signIn,
  };

  /**
   * Joining a server is how you get to it — going there is the only reason anybody
   * pressed the button. Switch first, close second, or a frame of the old shows.
   */
  const handleJoined = useCallback(
    (host: string) => {
      setServer(host);
      returnToTabs();
      onOpenChange(false);
    },
    [setServer, onOpenChange],
  );

  /* Android's back button. Without it, back with this open leaves the app —
   * see `useBackToClose`. */
  useBackToClose(open, () => onOpenChange(false));

  const sheet = useSheetInsets();

  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={() => onOpenChange(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "flex-end", paddingLeft: sheet.left, paddingRight: sheet.right }}>
        <Pressable accessibilityLabel="Close" onPress={() => onOpenChange(false)} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(5, 6, 10, 0.62)" }} />
        <Card onClose={() => onOpenChange(false)}>
          <AddServerBody
            // Remounts when the invite changes, which is what resets the field. A
            // second invite arriving should show the second server.
            key={initialInput ?? ""}
            initialInput={initialInput}
            open={open}
            join={join}
            has={has}
            account={account}
            onDone={handleJoined}
          />
        </Card>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Card({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityViewIsModal
      style={{
        marginHorizontal: theme.space(3.5),
        marginTop: insets.top + theme.space(3),
        marginBottom: Math.max(insets.bottom, theme.space(3.5)),
        maxHeight: "100%",
        borderRadius: 26,
        borderWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: theme.color.surface,
        overflow: "hidden",
      }}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: theme.space(5), gap: theme.space(3.5) }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ flex: 1, color: theme.color.text, fontSize: 21, fontWeight: "700" }}>Add a server</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}>
            <XIcon size={18} color={theme.color.muted} weight="bold" />
          </Pressable>
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

interface BodyProps {
  join: (host: string, info: JoinableServer) => Promise<void>;
  has: (host: string) => boolean;
  account: SheetAccount;
  /** Called with the host that was joined, so the app can go and look at it. */
  onDone: (host: string) => void;
}

/**
 * What the store actually keeps about a server, which is less than `/info` returns.
 * Named separately so a server that publishes nothing can still be joined.
 */
type JoinableServer = Pick<ServerInfo, "name" | "description" | "serverId">;

/**
 * Store the code, then join — adding the server is what starts the connection, and
 * the connection reads the code. Written even when the join fails.
 */
async function joinWithCode(
  host: string,
  info: JoinableServer,
  code: string,
  join: BodyProps["join"],
): Promise<string> {
  if (code) await rememberInviteCode(host, code);
  await join(host, info);
  return host;
}

function AddServerBody({
  initialInput,
  open,
  join,
  has,
  account,
  onDone,
}: BodyProps & { initialInput?: string; open: boolean }) {
  const theme = useTheme();
  const [input, setInput] = useState(initialInput ?? "");
  const state = useServerLookup(input);

  /**
   * The server we run, offered so an install with no invite has somewhere to go.
   * Only once it has answered: an offer that fails is worse than no offer.
   */
  const official = useOfficialServer(open);
  const showOfficial = !!official && !has(official.host) && input.trim() === "";

  /* Written down before the browser opens: Android can replace the app while it is in
   * front, and the root layout reopens this sheet with it once the account is back. */
  const signIn = useCallback(() => {
    void rememberPendingInvite(input);
    void account.signIn();
  }, [input, account]);

  const paste = useCallback(() => {
    void Clipboard.getStringAsync().then((text) => {
      if (text.trim()) setInput(text.trim());
    });
  }, []);
  const empty = input.trim() === "";

  return (
    <View style={{ gap: theme.space(3.5) }}>
      <TextField
        value={input}
        onChangeText={setInput}
        placeholder="Invite link or address"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        keyboardType="url"
        accessibilityLabel="Invite link or server address"
      />

      {empty ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space(2) }}>
          <QuickChip icon={<ClipboardTextIcon size={15} color={theme.color.muted} />} label="Paste invite link" onPress={paste} />
          {lanDiscoveryAvailable ? (
            <QuickChip icon={<BroadcastIcon size={15} color={theme.color.muted} />} label="Find on this network" onPress={() => router.push("/discovery")} />
          ) : null}
        </View>
      ) : null}

      {/* Only while the field is empty. Once there is an address in it the
          preview below answers the same question about a server the person
          actually chose, and two cards saying different things is one too
          many. */}
      {showOfficial && official && (
        <OfficialServerCard server={official} onPick={() => setInput(official.host)} />
      )}

      <Preview
        state={state}
        join={join}
        has={has}
        account={account}
        onSignIn={signIn}
        onDone={onDone}
      />
    </View>
  );
}

function QuickChip({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={6}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 32,
        paddingHorizontal: theme.space(3),
        borderRadius: theme.radius.full,
        borderWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
      })}
    >
      {icon}
      <Text style={{ color: theme.color.text, fontSize: 13.5 }}>{label}</Text>
    </Pressable>
  );
}

/**
 * The server we run, as a row you can press. Pressing it fills the field rather than
 * joining: everything the join needs already hangs off the address.
 */
function OfficialServerCard({
  server,
  onPick,
}: {
  server: OfficialServer;
  onPick: () => void;
}) {
  const theme = useTheme();
  const { host, info } = server;

  return (
    <Pressable onPress={onPick} accessibilityRole="button">
      <Surface
        bordered
        radius="lg"
        padding={theme.space(4)}
        style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}
      >
        <UsersThreeIcon size={20} color={theme.color.accent} weight="fill" />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "600" }}>
            {info?.name || "The Gryt server"}
          </Text>
          {/* The member count when the server gave one, and the address when it
              did not. Both say the same thing — this is a real place — and one
              of them is a number we did not make up. */}
          <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 19 }}>
            {info
              ? `We run this one. ${info.members} ${info.members === "1" ? "member" : "members"}.`
              : `We run this one. ${host}`}
          </Text>
        </View>
      </Surface>
    </Pressable>
  );
}

function Preview({
  state,
  join,
  has,
  account,
  onSignIn,
  onDone,
}: BodyProps & { state: LookupState; onSignIn: () => void }) {
  const theme = useTheme();

  if (state.kind === "idle") return null;

  if (state.kind === "loading") {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(3),
          padding: theme.space(4),
        }}
      >
        <Spinner color={theme.color.muted} />
        <Text style={{ color: theme.color.muted, fontSize: 15 }}>Asking the server…</Text>
      </View>
    );
  }

  if (state.kind === "error") {
    /* `Alert` rather than a bordered row with a warning glyph. Same colour, and it
       announces itself as an assertive live region. */
    return <Alert severity="error">{state.message}</Alert>;
  }

  if (state.kind === "private") {
    return <Private host={state.host} code={state.code} join={join} has={has} onDone={onDone} />;
  }

  return (
    <Found
      host={state.host}
      info={state.info}
      code={state.code}
      join={join}
      has={has}
      account={account}
      onSignIn={onSignIn}
      onDone={onDone}
    />
  );
}

/**
 * A server that will not say what it is. It still gets a button — every server with
 * `discoverable` off is one, reached by the invite made for it (GRYT-845).
 */
function Private({
  host,
  code,
  join,
  has,
  onDone,
}: Omit<BodyProps, "account"> & { host: string; code: string }) {
  const theme = useTheme();
  const [joining, setJoining] = useState(false);

  const already = has(host);

  return (
    <View style={{ gap: theme.space(3) }}>
      <Surface
        bordered
        radius="lg"
        padding={theme.space(4)}
        style={{ flexDirection: "row", gap: theme.space(3) }}
      >
        <LockIcon size={20} color={theme.color.muted} weight="fill" />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "600" }}>
            {host}
          </Text>
          <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 19 }}>
            This server does not describe itself publicly. If you have an invite, joining
            may still work.
          </Text>
        </View>
      </Surface>

      <Button
        tone="primary"
        size="large"
        disabled={joining || already}
        onPress={() => {
          setJoining(true);
          void joinWithCode(host, { name: host }, code, join).then(onDone);
        }}
      >
        {addLabel(already, joining, "Add this server")}
      </Button>
    </View>
  );
}

function Found({
  host,
  info,
  code,
  join,
  has,
  account,
  onSignIn,
  onDone,
}: BodyProps & { host: string; info: ServerInfo; code: string; onSignIn: () => void }) {
  const theme = useTheme();
  const [joining, setJoining] = useState(false);
  const [typedCode, setTypedCode] = useState("");

  const already = has(host);

  /* The same decisions the desktop's invite dialog makes, from the same `/info`
   * (GRYT-1291, GRYT-1292). `code` is the link's, and stays empty for a host-only one. */
  const view = joinSheetView({
    linkCode: code,
    typedCode,
    info,
    signedIn: account.signedIn,
    alreadyAdded: already,
  });

  /**
   * "No account needed" is only claimed when the server actually said so. An older
   * server sends no `identityTiers`, and a missing field is not a false one.
   */
  const localAllowed = info.identityTiers?.includes("local") ?? false;

  return (
    <View style={{ gap: theme.space(3) }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(3),
          padding: theme.space(3),
          borderRadius: 16,
          borderWidth: 1,
          borderColor: theme.color.border,
          backgroundColor: theme.color.surfaceRaised,
        }}
      >
        <ServerIcon host={host} name={info.name} size={44} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 16, fontWeight: "700" }}>
            {info.name}
          </Text>
          <Text numberOfLines={2} style={{ color: theme.color.muted, fontSize: 13, lineHeight: 18 }}>
            {[
              `${info.members} ${info.members === "1" ? "member" : "members"}`,
              info.joinPolicy ? (JOIN_POLICY_LINE[info.joinPolicy] ?? "Invite only") : null,
              localAllowed ? "No account needed" : null,
              info.lanOpen ? "Open on your network" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
        {already ? null : <CheckCircleIcon size={20} color={theme.color.success} weight="fill" />}
      </View>

      {/* A link or an address with no code, to a server that wants one. The
          desktop asks in its invite dialog at the same point. */}
      {view.showCodeField && !already ? (
        <View style={{ gap: theme.space(2) }}>
          <Text style={{ color: theme.color.muted, fontSize: 15, lineHeight: 20 }}>
            {view.codeRequired
              ? "This server is invite only. Already a member? Just join. New here? Paste your invite code."
              : "On this network you can join without a code. Paste one if you have it."}
          </Text>
          <TextField
            value={typedCode}
            onChangeText={(text) => setTypedCode(normalizeCode(text))}
            placeholder="Paste invite code"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!joining}
            accessibilityLabel="Invite code"
          />
        </View>
      ) : null}

      {view.needsAccount && !already ? (
        <Text style={{ color: theme.color.text, fontSize: 15, lineHeight: 20 }}>
          You need a Gryt account to join. Sign in and you&rsquo;ll come back to this invite.
        </Text>
      ) : null}

      {/* `Button` rather than a Pressable painted to look like one. The
          disabled and pressed states were hand-mixed here and the library
          already has both, from the same tokens. */}
      {view.action.kind === "sign-in" ? (
        <Button tone="primary" size="large" disabled={account.signingIn} onPress={onSignIn}>
          {account.signingIn ? "Opening the browser…" : "Sign in to join"}
        </Button>
      ) : (
        <Button
          tone="primary"
          size="large"
          disabled={joining || view.action.kind !== "join" || view.action.disabled}
          onPress={() => {
            setJoining(true);
            void joinWithCode(host, info, view.code, join).then(onDone);
          }}
        >
          {addLabel(already, joining, `Add ${info.name}`)}
        </Button>
      )}
    </View>
  );
}
