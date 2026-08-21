import { Children, type ReactNode } from "react";
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { Divider, Surface, useTheme } from "@gryt/ui-native";
import { BugIcon } from "phosphor-react-native/src/icons/Bug";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
import { FlaskIcon } from "phosphor-react-native/src/icons/Flask";
import { GearSixIcon } from "phosphor-react-native/src/icons/GearSix";
import { HeartIcon } from "phosphor-react-native/src/icons/Heart";
import { MicrophoneIcon } from "phosphor-react-native/src/icons/Microphone";
import { MicrophoneSlashIcon } from "phosphor-react-native/src/icons/MicrophoneSlash";
import { PhoneDisconnectIcon } from "phosphor-react-native/src/icons/PhoneDisconnect";
import { SpeakerHighIcon } from "phosphor-react-native/src/icons/SpeakerHigh";
import { SpeakerSlashIcon } from "phosphor-react-native/src/icons/SpeakerSlash";
import { KeyIcon } from "phosphor-react-native/src/icons/Key";
import { UserCircleIcon } from "phosphor-react-native/src/icons/UserCircle";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { useGrytAccount } from "../account/AccountProvider";
import type { Account } from "../account/useAccount";
import { useShell } from "./ShellContext";
import { STATUS_LABEL } from "./data";
import { TAB_BAR_SPACE } from "./TabBar";
import { useMe } from "./useMe";

/** Where feedback and bug reports go, since there is no in-app form. */
const ISSUES = "https://github.com/Gryt-chat/gryt/issues/new";

/**
 * The You tab, as a page.
 *
 * It was a sheet, and being one cost three things. The bar had to interpolate
 * the selection towards a slot the pager knew nothing about, because You was
 * the only tab that was not a place. The layout kept a `youOpen` flag beside
 * the route, which is a second answer to "which tab am I on" and could disagree
 * with the first. And the sheet covered the bar it was opened from, so while
 * You was showing, the thing marking You as selected was off screen.
 *
 * The fourth is the one visible in this file's diff. `@gorhom/portal` renders a
 * sheet's children in a different React tree and context does not cross it, so
 * every single thing the body needed — the shell, the account, `me` — was read
 * outside and drilled in as props, with a paragraph explaining why. A screen is
 * in the ordinary tree. The hooks are just called.
 *
 * Contents are still the desktop client's own — its avatar menu and its mini
 * controls — rather than the reference's, whose rows are Slack's features.
 * What is deliberately not here is a custom status: `UserStatus` on the server
 * is `online | in_voice | afk | offline`, all four derived, and there is no
 * free-text status to write into. A field that accepted one and dropped it
 * would be worse than not offering it.
 */
export function YouScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { voice, toggleVoice, voiceChannel, setVoiceChannel } = useShell();
  const account = useGrytAccount();
  const me = useMe(voiceChannel !== null);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.space(4),
          paddingHorizontal: theme.space(4),
          gap: theme.space(5),
          /* The bar floats over this, so the page reserves the room itself.
             `TAB_BAR_SPACE` runs from the bottom of the screen and already
             covers the safe area. */
          paddingBottom: TAB_BAR_SPACE + theme.space(4),
        }}
      >
        {/* No page title above this. The sheet had one — "You", centred, with a
            close button beside it — and on a page it read as a modal that
            forgot to be one, sitting directly above a name that is *also*
            "You" when you are signed out. Your own name is the title. */}
        <Profile me={me} />

        <Controls
          voice={voice}
          toggleVoice={toggleVoice}
          inCall={voiceChannel !== null}
          onLeave={() => setVoiceChannel(null)}
        />

        {/* Grouped, rather than one flat run of rows. Two groups: what you are,
            and what the app is. The identity and the account belong together
            for the reason in `AccountRow`. */}
        <Group title="You">
          {/* "Set yourself as away" and "View profile" were here and neither
              did anything. AFK is derived on the server — `UserStatus` is
              `online | in_voice | afk | offline`, all four computed, so there
              is nothing for a row to set — and a profile screen does not
              exist. Both are gone rather than sitting there being tapped. */}
          <MenuRow
            icon={<KeyIcon size={22} color={theme.color.text} weight="fill" />}
            label="Your identity"
            hint="The twenty-four words that are you"
            onPress={() => router.push("/identity")}
          />
          <AccountRow account={account} />
        </Group>

        <Group title="App">
          <MenuRow
            icon={<GearSixIcon size={22} color={theme.color.text} weight="fill" />}
            label="Settings"
            hint="Preferences, and which build this is"
            onPress={() => router.push("/preferences")}
          />
          {/* Both go to the issue tracker, because there is no in-app form and
              a row that opens nothing is worse than one that leaves the app. */}
          <MenuRow
            icon={<HeartIcon size={22} color={theme.color.text} weight="fill" />}
            label="Give feedback"
            hint="Opens the issue tracker"
            onPress={() => void WebBrowser.openBrowserAsync(ISSUES)}
          />
          <MenuRow
            icon={<BugIcon size={22} color={theme.color.text} weight="fill" />}
            label="Report a bug"
            hint="Opens the issue tracker"
            onPress={() => void WebBrowser.openBrowserAsync(ISSUES)}
          />
          {/* The desktop client gates its Developer section on a dev build.
              Same section, same gate. */}
          {__DEV__ ? (
            <MenuRow
              icon={<FlaskIcon size={22} color={theme.color.text} weight="fill" />}
              label="Components"
              onPress={() => router.push("/dev")}
            />
          ) : null}
        </Group>

        {/* The id only. It used to fall back to `me.detail`, which is the
            line already under your name three inches up — so signed out, the
            page said "Not signed in" twice and the second one looked like a
            different fact. */}
        {me.id ? (
          <Text
            style={{
              color: theme.color.muted,
              fontSize: 12,
              textAlign: "center",
            }}
          >
            {me.id}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * Who you are, at the top of your own page.
 *
 * The generated face rather than initials, because the tab that got you here
 * shows the face and a page answering it with "YO" in a circle reads as two
 * different people. `PersonAvatar` rather than `AvatarFace` so an uploaded
 * avatar wins the moment there is one, the way it does on the desktop.
 */
function Profile({ me }: { me: ReturnType<typeof useMe> }) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(4) }}>
      <PersonAvatar name={me.name} size={72} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{ color: theme.color.text, fontSize: 30, fontWeight: "700" }}
        >
          {me.name}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: theme.radius.full,
              backgroundColor:
                me.status === "in_voice" ? theme.color.accent : theme.color.success,
            }}
          />
          <Text style={{ color: theme.color.muted, fontSize: 15 }}>
            {STATUS_LABEL[me.status]}
          </Text>
        </View>
        {/* Was 12pt grey at the very bottom of the sheet, which is where you put
            something nobody should read. It says whether you are signed in. */}
        <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 14 }}>
          {me.detail}
        </Text>
      </View>
    </View>
  );
}

/**
 * The desktop client's MiniControls, minus the two that were pretending.
 *
 * Camera and screen share were here and neither captured anything — both only
 * moved a flag in `VoiceState` that nothing downstream read. The README used
 * to argue for keeping them as honest placeholders. That is the wrong trade:
 * a button that lights up and does nothing is not honest about anything, it
 * just takes a tap to find out. They come back when there is a track behind
 * them.
 *
 * **Leave is only there when there is something to leave.** It used to be
 * permanent and `onPress={() => {}}` — a red button that did nothing, on the
 * screen most likely to be opened by somebody trying to get out of a call.
 *
 * Server-forced mute is not modelled. There is no server to force it.
 */
function Controls({
  voice,
  toggleVoice,
  inCall,
  onLeave,
}: {
  voice: ReturnType<typeof useShell>["voice"];
  toggleVoice: ReturnType<typeof useShell>["toggleVoice"];
  inCall: boolean;
  onLeave: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: theme.space(2) }}>
      <ControlButton
        label={voice.muted ? "Unmute" : "Mute"}
        active={voice.muted}
        onPress={() => toggleVoice("muted")}
        icon={
          voice.muted ? (
            <MicrophoneSlashIcon size={22} color={theme.color.onDanger} weight="fill" />
          ) : (
            <MicrophoneIcon size={22} color={theme.color.text} weight="fill" />
          )
        }
      />
      <ControlButton
        label={voice.deafened ? "Undeafen" : "Deafen"}
        active={voice.deafened}
        onPress={() => toggleVoice("deafened")}
        icon={
          voice.deafened ? (
            <SpeakerSlashIcon size={22} color={theme.color.onDanger} weight="fill" />
          ) : (
            <SpeakerHighIcon size={22} color={theme.color.text} weight="fill" />
          )
        }
      />
      {inCall ? (
        <ControlButton
          label="Leave"
          active
          onPress={onLeave}
          icon={<PhoneDisconnectIcon size={22} color={theme.color.onDanger} weight="fill" />}
        />
      ) : null}
    </View>
  );
}

function ControlButton({
  icon,
  label,
  active,
  tone = "danger",
  onPress,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  tone?: "danger" | "accent";
  onPress: () => void;
}) {
  const theme = useTheme();
  const on = tone === "danger" ? theme.color.danger : theme.color.accent;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        /* Fixed rather than `flex: 1`. It was flexed while there were five of
           these and two of them did nothing; with the pretenders gone, flexing
           made mute and deafen half a screen wide each, which reads as two
           big primary actions rather than two toggles. */
        width: 64,
        height: 52,
        borderRadius: theme.radius.md,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active
          ? on
          : pressed
            ? theme.color.surfaceHover
            : theme.color.surfaceRaised,
      })}
    >
      {icon}
    </Pressable>
  );
}

/**
 * A titled card of rows.
 *
 * The rows used to be one flat run with a `Divider` halfway down, which said
 * "these are two things" without saying what either was. The card also gives
 * the rows an edge, so a row is a row rather than an icon floating next to some
 * text.
 */
function Group({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();

  /* `Children.toArray` drops the nulls, so the `__DEV__` row being absent does
   * not leave a separator with nothing under it. */
  const rows = Children.toArray(children);

  return (
    <View style={{ gap: theme.space(2) }}>
      <Text
        style={{
          color: theme.color.muted,
          fontSize: 13,
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          paddingHorizontal: theme.space(1),
        }}
      >
        {title}
      </Text>
      <Surface bordered radius="lg" style={{ overflow: "hidden" }}>
        {rows.map((row, i) => (
          <View key={i}>
            {/* Inset past the icon, which is what stops a list of rows reading
                as a stack of separate cards. */}
            {i > 0 ? (
              <Divider style={{ marginLeft: theme.space(4) + 22 + theme.space(3) }} />
            ) : null}
            {row}
          </View>
        ))}
      </Surface>
    </View>
  );
}

/**
 * One row.
 *
 * A chevron only where there is somewhere to go. Several of these rows are
 * still without a destination — settings, a profile screen, AFK as a switch —
 * and a row that promises one and does nothing is worse than a row that
 * promises nothing.
 */
function MenuRow({
  icon,
  label,
  hint,
  tone,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  tone?: "danger";
  onPress?: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !onPress }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(3),
        paddingHorizontal: theme.space(4),
        backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
      })}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: tone === "danger" ? theme.color.danger : theme.color.text,
            fontSize: 17,
            fontWeight: "500",
          }}
        >
          {label}
        </Text>
        {hint ? (
          <Text style={{ color: theme.color.muted, fontSize: 13 }}>{hint}</Text>
        ) : null}
      </View>
      {onPress ? (
        <CaretRightIcon size={16} color={theme.color.muted} weight="bold" />
      ) : null}
    </Pressable>
  );
}

/**
 * Signing in to a Gryt account, next to the device identity rather than
 * instead of it.
 *
 * The two are different things and the order here says so: the twenty-four
 * words are what this device is on every server, signed in or not, and an
 * account is something it additionally knows. Signing out leaves every
 * membership exactly where it was — which is why there is no second sign-out
 * further down the page. There used to be, it did nothing, and it read as
 * signing out of Gryt entirely.
 */
function AccountRow({ account }: { account: Account }) {
  const theme = useTheme();
  const { state, signIn, signOut } = account;

  if (state.status === "loading") {
    return (
      <MenuRow
        icon={<UserCircleIcon size={22} color={theme.color.muted} weight="fill" />}
        label="Account"
        hint="Checking…"
      />
    );
  }

  if (state.status === "signedIn") {
    return (
      <MenuRow
        icon={<UserCircleIcon size={22} color={theme.color.text} weight="fill" />}
        label={state.profile.label}
        hint="Signed in — tap to sign out"
        onPress={() => void signOut()}
      />
    );
  }

  return (
    <MenuRow
      icon={<UserCircleIcon size={22} color={theme.color.text} weight="fill" />}
      label="Sign in to Gryt"
      hint={
        state.status === "signingIn"
          ? "Opening the browser…"
          : state.status === "error"
            ? state.message
            : "Optional. One identity across servers"
      }
      onPress={state.status === "signingIn" ? undefined : () => void signIn()}
    />
  );
}
