import { useCallback, useState } from "react";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import {
  Alert,
  Button,
  Chip,
  Sheet,
  Spinner,
  Surface,
  Text,
  TextField,
  useTheme,
} from "@gryt/ui-native";
import { BroadcastIcon } from "phosphor-react-native/src/icons/Broadcast";
import { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";
import { LockIcon } from "phosphor-react-native/src/icons/Lock";
import { UsersIcon } from "phosphor-react-native/src/icons/Users";
import { UsersThreeIcon } from "phosphor-react-native/src/icons/UsersThree";

import { ServerIcon } from "./ServerIcon";
import { rememberInviteCode } from "./inviteCodes";
import { useServers } from "./store";
import { useShell } from "../shell/ShellContext";
import { type OfficialServer, useOfficialServer } from "./useOfficialServer";
import { useServerLookup, type LookupState } from "./useServerLookup";
import type { ServerInfo } from "./info";
import { useBackToClose } from "../ui/useBackToClose";

/**
 * What an invite looks like, for the chips under the field. Literal examples rather
 * than a description: the plain-http one is here because a phone can dial one.
 */
const INPUT_EXAMPLES = [
  "gryt.chat/invite?host=…",
  "chat.example.com",
  "localhost:5001",
  "192.168.1.42:5001",
];

export interface AddServerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What an invite link filled in, if the sheet was opened by one. */
  initialInput?: string;
}

/**
 * A sheet rather than a Dialog, deliberately: the field here takes a keyboard,
 * and the sheet handles that for free while a Dialog would have to be told.
 */
export function AddServerSheet({
  open,
  onOpenChange,
  initialInput,
}: AddServerSheetProps) {
  /**
   * `useServers` is read **here**, outside `Sheet.Content`, and handed down.
   * `@gorhom/portal` renders the sheet's children in a different React tree.
   */
  const { join, has } = useServers();
  const { setServer } = useShell();

  /**
   * Joining a server is how you get to it — going there is the only reason anybody
   * pressed the button. Switch first, close second, or a frame of the old shows.
   */
  const handleJoined = useCallback(
    (host: string) => {
      setServer(host);
      router.navigate("/(tabs)/(server)");
      onOpenChange(false);
    },
    [setServer, onOpenChange],
  );

  /* Android's back button. Without it, back with this open leaves the app —
   * see `useBackToClose`. */
  useBackToClose(open, () => onOpenChange(false));

  return (
    <Sheet snapPoints={["82%"]} open={open} onOpenChange={onOpenChange}>
      {/* `Sheet.ScrollView` rather than `Sheet.Content` with a scroll view
          inside it. It owns the bounded height, the padding and the keyboard
          inset — the four things this sheet used to assemble by hand, and got
          wrong once: the Add button sat below the fold in build 5 and could
          not be reached at all. GRYT-492. */}
      <Sheet.ScrollView>
        <AddServerBody
          // Remounts when the invite changes, which is what resets the field. A
          // second invite arriving should show the second server.
          key={initialInput ?? ""}
          initialInput={initialInput}
          open={open}
          join={join}
          has={has}
          onDone={handleJoined}
        />
      </Sheet.ScrollView>
    </Sheet>
  );
}

interface BodyProps {
  join: (host: string, info: JoinableServer) => Promise<void>;
  has: (host: string) => boolean;
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

  /* The scrolling, the padding and the keyboard inset are `Sheet.ScrollView`'s now.
   * What is left here is the spacing between this sheet's own blocks. */
  return (
    <View style={{ gap: theme.space(4) }}>
      <View style={{ gap: theme.space(2) }}>
        <Text style={{ color: theme.color.text, fontSize: 22, fontWeight: "700" }}>
          Add a server
        </Text>
        <Text style={{ color: theme.color.muted, fontSize: 15, lineHeight: 20 }}>
          Paste an invite link, or type the address of a server you know.
        </Text>
      </View>

      <TextField
        value={input}
        onChangeText={setInput}
        placeholder="Invite link or address"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        accessibilityLabel="Invite link or server address"
      />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space(2) }}>
        {INPUT_EXAMPLES.map((example) => (
          <Chip key={example} label={example} variant="outline" />
        ))}
      </View>

      {/* Only while the field is empty. Once there is an address in it the
          preview below answers the same question about a server the person
          actually chose, and two cards saying different things is one too
          many. */}
      {showOfficial && official && (
        <OfficialServerCard server={official} onPick={() => setInput(official.host)} />
      )}

      <Preview state={state} join={join} has={has} onDone={onDone} />
    </View>
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
  onDone,
}: BodyProps & { state: LookupState }) {
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
}: BodyProps & { host: string; code: string }) {
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
        {already ? "Already added" : joining ? "Adding…" : "Add this server"}
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
  onDone,
}: BodyProps & { host: string; info: ServerInfo; code: string }) {
  const theme = useTheme();
  const [joining, setJoining] = useState(false);

  const already = has(host);

  /**
   * "No account needed" is only claimed when the server actually said so. An older
   * server sends no `identityTiers`, and a missing field is not a false one.
   */
  const localAllowed = info.identityTiers?.includes("local") ?? false;

  return (
    <View style={{ gap: theme.space(3) }}>
      <Surface bordered radius="lg" level="raised" padding={theme.space(4)} style={{ gap: theme.space(3) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
          <ServerIcon host={host} name={info.name} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700" }}>
              {info.name}
            </Text>
            <Text style={{ color: theme.color.muted, fontSize: 14 }} numberOfLines={1}>
              {host}
            </Text>
          </View>
        </View>

        {info.description ? (
          <Text style={{ color: theme.color.muted, fontSize: 15, lineHeight: 20 }}>
            {info.description}
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space(3) }}>
          <Fact icon={<UsersIcon size={16} color={theme.color.muted} weight="fill" />}>
            {info.members} {info.members === "1" ? "member" : "members"}
          </Fact>
          {info.joinPolicy ? (
            <Fact icon={<LockIcon size={16} color={theme.color.muted} weight="fill" />}>
              {info.joinPolicy === "open"
                ? "Anyone can join"
                : info.joinPolicy === "request"
                  ? "Joining needs approval"
                  : "Invite only"}
            </Fact>
          ) : null}
          {localAllowed ? (
            <Fact
              icon={<CheckCircleIcon size={16} color={theme.color.success} weight="fill" />}
            >
              No account needed
            </Fact>
          ) : null}
          {info.lanOpen ? (
            <Fact icon={<BroadcastIcon size={16} color={theme.color.muted} weight="fill" />}>
              Open on your network
            </Fact>
          ) : null}
        </View>
      </Surface>

      {/* `Button` rather than a Pressable painted to look like one. The
          disabled and pressed states were hand-mixed here and the library
          already has both, from the same tokens. */}
      <Button
        tone="primary"
        size="large"
        disabled={joining || already}
        onPress={() => {
          setJoining(true);
          void joinWithCode(host, info, code, join).then(onDone);
        }}
      >
        {already ? "Already added" : joining ? "Adding…" : `Add ${info.name}`}
      </Button>
    </View>
  );
}

function Fact({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {icon}
      <Text style={{ color: theme.color.muted, fontSize: 14 }}>{children}</Text>
    </View>
  );
}
