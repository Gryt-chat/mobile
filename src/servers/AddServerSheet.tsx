import { useState } from "react";
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

import { ServerIcon } from "./ServerIcon";
import { rememberInviteCode } from "./inviteCodes";
import { useServers } from "./store";
import { useServerLookup, type LookupState } from "./useServerLookup";
import type { ServerInfo } from "./info";
import { useBackToClose } from "../ui/useBackToClose";

/**
 * What an invite looks like, for the chips under the field.
 *
 * Kept as literal examples rather than a description of the format, which is
 * the call the desktop client made and the right one: "an invite link or a
 * server address" tells somebody nothing about whether the thing on their
 * clipboard is one.
 *
 * The client shows a fourth, `192.168.1.42:5001`, only on desktop, because the
 * web build cannot dial a plain-http address at all. A phone can, so it is here.
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
 * A sheet rather than a Dialog, which is the one place this departs from the
 * desktop client's shape on purpose.
 *
 * `@gryt/ui-native`'s own note is that a sheet is what a phone does where the
 * web opens a dialog, and this is the case that makes it concrete: the field
 * here takes a keyboard, and the sheet handles the keyboard for free while a
 * Dialog would have to be told about it.
 */
export function AddServerSheet({
  open,
  onOpenChange,
  initialInput,
}: AddServerSheetProps) {
  /**
   * `useServers` is read **here**, outside `Sheet.Content`, and handed down.
   *
   * `@gorhom/portal` renders the sheet's children in a different React tree, so
   * context does not reach them: calling this below throws "must be used inside
   * ServersProvider" from a component that visibly is inside one. `useTheme`
   * survives only because the Sheet re-provides it on the far side.
   *
   * This is the third component to hit it. It is in the app README.
   */
  const { join, has } = useServers();

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
          // Remounts when the invite changes, which is what resets the field
          // to it. A second invite arriving while the sheet is open should
          // show the second server, not the first.
          key={initialInput ?? ""}
          initialInput={initialInput}
          join={join}
          has={has}
          onDone={() => onOpenChange(false)}
        />
      </Sheet.ScrollView>
    </Sheet>
  );
}

interface BodyProps {
  join: (host: string, info: JoinableServer) => Promise<void>;
  has: (host: string) => boolean;
  onDone: () => void;
}

/**
 * What the store actually keeps about a server, which is less than `/info`
 * returns.
 *
 * Named separately so a server that publishes nothing can still be joined: the
 * only honest thing to call it is its address, and inventing a member count to
 * satisfy `ServerInfo` would put a fiction in storage to get past a type.
 */
type JoinableServer = Pick<ServerInfo, "name" | "description" | "serverId">;

/**
 * Store the code, then join.
 *
 * In that order, because adding the server is what starts the connection, and
 * the connection reads the code from storage. Written even when the join below
 * fails — a wrong nickname or a dropped socket is worth a retry, and a retry
 * without the code fails differently and more confusingly.
 */
async function joinWithCode(
  host: string,
  info: JoinableServer,
  code: string,
  join: BodyProps["join"],
): Promise<void> {
  if (code) await rememberInviteCode(host, code);
  await join(host, info);
}

function AddServerBody({
  initialInput,
  join,
  has,
  onDone,
}: BodyProps & { initialInput?: string }) {
  const theme = useTheme();
  const [input, setInput] = useState(initialInput ?? "");
  const state = useServerLookup(input);

  /* The scrolling, the padding and the keyboard inset are `Sheet.ScrollView`'s
   * now — see the note where it is rendered. What is left here is the spacing
   * between this sheet's own blocks. */
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

      <Preview state={state} join={join} has={has} onDone={onDone} />
    </View>
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
    /* `Alert` rather than a bordered row with a warning glyph. Same colour,
       and it also announces itself as an assertive live region — which the
       icon never did. */
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
 * A server that will not say what it is.
 *
 * It still gets a button. The card says joining may still work, and for a year
 * it said so above nothing to tap — which is every server with `discoverable`
 * off, reached by the invite link that was made for exactly this. GRYT-845.
 *
 * The address is the name, because it is the only thing known here. The real
 * one arrives with the first `server:details` and replaces it.
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
   * "No account needed" is only claimed when the server actually said so.
   *
   * An older server sends no `identityTiers` at all, and a missing field is not
   * a false one — treating it as one would promise something the door then
   * refuses.
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
