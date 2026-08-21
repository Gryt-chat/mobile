import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  Alert,
  Button,
  Chip,
  Sheet,
  Spinner,
  Surface,
  TextField,
  useTheme,
} from "@gryt/ui-native";
import { BroadcastIcon } from "phosphor-react-native/src/icons/Broadcast";
import { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";
import { LockIcon } from "phosphor-react-native/src/icons/Lock";
import { UsersIcon } from "phosphor-react-native/src/icons/Users";

import { ServerIcon } from "./ServerIcon";
import { useServers } from "./store";
import { useServerLookup, type LookupState } from "./useServerLookup";
import type { ServerInfo } from "./info";

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

  return (
    <Sheet snapPoints={["82%"]} open={open} onOpenChange={onOpenChange}>
      {/* `height: "100%"` for the same reason the voice sheet needs it.
          `Sheet.Content` is a `BottomSheetView`, which sizes itself to its
          content — so a scroll view inside it has no bounded height to scroll
          within and simply grows until the sheet clips it. Given a definite
          height it has something to be all of, and the scroll view can
          overflow. */}
      <Sheet.Content style={{ padding: 0, height: "100%" }}>
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
      </Sheet.Content>
    </Sheet>
  );
}

interface BodyProps {
  join: (host: string, info: ServerInfo) => Promise<void>;
  has: (host: string) => boolean;
  onDone: () => void;
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

  /**
   * `BottomSheetScrollView`, not React Native's.
   *
   * The sheet's pan gesture and a plain ScrollView's native recogniser both
   * want the touch, and the two are introduced by reference — so a plain one
   * does not scroll inside a sheet at all. `Drawer.ScrollView` exists in
   * `@gryt/ui-native` for exactly this reason on the drawer; there is no
   * `Sheet.ScrollView` yet, which is GRYT-492.
   *
   * It went unnoticed because the content had always been shorter than the
   * sheet. "On your network" is what pushed it over: with two servers found
   * and a lookup card open, the Add button sits below the fold and could not
   * be reached at all. That shipped in build 5.
   */
  return (
    <BottomSheetScrollView
      contentContainerStyle={{ padding: theme.space(4), gap: theme.space(4) }}
      keyboardShouldPersistTaps="handled"
      /* The keyboard is up for most of this sheet's life — it exists to take a
       * typed address — and it covers the bottom 40% of the screen, which is
       * exactly where the lookup card and the Add button are. This adds the
       * keyboard's height as a bottom inset so both can be scrolled into what
       * is left. Without it the card appears underneath the keyboard and the
       * button is not reachable at all. */
      automaticallyAdjustKeyboardInsets
    >
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
    </BottomSheetScrollView>
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
              {state.host}
            </Text>
            <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 19 }}>
              This server does not describe itself publicly. If you have an invite, joining
              may still work.
            </Text>
          </View>
        </Surface>
      </View>
    );
  }

  return <Found host={state.host} info={state.info} join={join} has={has} onDone={onDone} />;
}

function Found({
  host,
  info,
  join,
  has,
  onDone,
}: BodyProps & { host: string; info: ServerInfo }) {
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
          void join(host, info).then(onDone);
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
