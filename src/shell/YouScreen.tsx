import { Children, type ReactNode } from "react";
import { router } from "expo-router";
import { ActionSheetIOS, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { Button, Divider, Surface, useTheme } from "@gryt/ui-native";
import { BugIcon } from "phosphor-react-native/src/icons/Bug";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
import { FlaskIcon } from "phosphor-react-native/src/icons/Flask";
import { GearSixIcon } from "phosphor-react-native/src/icons/GearSix";
import { HeartIcon } from "phosphor-react-native/src/icons/Heart";
import { PhoneDisconnectIcon } from "phosphor-react-native/src/icons/PhoneDisconnect";
import { KeyIcon } from "phosphor-react-native/src/icons/Key";
import { UserCircleIcon } from "phosphor-react-native/src/icons/UserCircle";

import { ProfileCard } from "../profile/ProfileCard";
import { useProfileState } from "../profile/ProfileProvider";
import { useGrytAccount } from "../account/AccountProvider";
import type { Account } from "../account/useAccount";
import { useShell } from "./ShellContext";
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
  const { server, voiceChannel, setVoiceChannel } = useShell();
  /* The shared instance from the tabs layout, not a second `useProfile`. Two
   * would be two socket subscriptions holding two copies of one answer. */
  const profile = useProfileState();
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
        <ProfileCard
          profile={profile}
          serverName={server?.name ?? null}
          fallbackName={me.name}
        />

        <Controls inCall={voiceChannel !== null} onLeave={() => setVoiceChannel(null)} />

        {/* Descriptions are gone from every row. They were explaining labels
            that did not need it — "Opens the issue tracker" under "Report a
            bug" — and the second line took each row from about 62pt to 48pt
            for nothing. Still above the 44pt minimum, which is the reason not
            to take anything else out. */}
        <Group title="You">
          {/* Only while there is no account. Signed in, this moves under the
              account as its fallback rather than sitting beside it as a peer —
              see `AccountRow`. GRYT-501. */}
          {me.signedIn ? null : (
            <MenuRow
              icon={<KeyIcon size={22} color={theme.color.text} weight="fill" />}
              label="Your identity"
              onPress={() => router.push("/identity")}
            />
          )}
          <MenuRow
            icon={<GearSixIcon size={22} color={theme.color.text} weight="fill" />}
            label="Settings"
            onPress={() => router.push("/preferences")}
          />
        </Group>

        <Group title="App">
          {/* The in-app form exists and is not connected to anything yet.
           *
           * `Gryt-chat/reports` is the service and joining the two is being
           * done separately, so on a dev build these open the form — which is
           * how it gets looked at — and everywhere else they still open the
           * issue tracker, which works. A form that cannot send is worse than
           * a link that can, and this page's own rule is that a control exists
           * when there is something behind it.
           *
           * The wiring deletes the ternary. GRYT-519. */}
          <MenuRow
            icon={<HeartIcon size={22} color={theme.color.text} weight="fill" />}
            label="Give feedback"
            onPress={() =>
              __DEV__
                ? router.push("/report?type=feedback")
                : void WebBrowser.openBrowserAsync(ISSUES)
            }
          />
          <MenuRow
            icon={<BugIcon size={22} color={theme.color.text} weight="fill" />}
            label="Report a bug"
            onPress={() =>
              __DEV__
                ? router.push("/report?type=bug")
                : void WebBrowser.openBrowserAsync(ISSUES)
            }
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

        {/* The account, last.
         *
         * It used to sit in the "You" group directly under "Your identity",
         * which read as two logins to choose between. Putting the account at
         * the foot of the page, on its own, was the smallest change that
         * stopped the two looking like alternatives.
         *
         * It was not enough. Signed in they were still two peers on one page,
         * and the rule is that the account is who you are when there is one —
         * so the identity is now inside this group, under the account, said to
         * be the fallback it is. GRYT-501. */}
        <View style={{ flex: 1 }} />
        <AccountRow account={account} />

      </ScrollView>
    </View>
  );
}

/**
 * The one control on this page, and only while there is a call.
 *
 * This was the desktop client's MiniControls — mic, deafen, camera, screen
 * share, leave — and all four of the toggles have now gone for the same reason
 * in two rounds. Camera and screen share captured nothing (GRYT-488). Mute and
 * deafen did work, and still did not belong: hanging up clears both, so every
 * call starts unmuted and undeafened, and a mute toggle on a profile page sets
 * a thing that has no call to apply to. They live in the call, which is the
 * only place the state means anything.
 *
 * **Leave is only there when there is something to leave.** It used to be
 * permanent and `onPress={() => {}}` — a red button that did nothing, on the
 * screen most likely to be opened by somebody trying to get out of a call.
 */
function Controls({ inCall, onLeave }: { inCall: boolean; onLeave: () => void }) {
  const theme = useTheme();

  if (!inCall) return null;

  /* `Button`, not the icon tile this row used to be made of. That tile existed
   * so five of them could sit in a row; one of anything is a button, and the
   * library has one. It also gets a label, which an icon-only leave button on a
   * page with no other call chrome could badly use. */
  return (
    <Button
      tone="danger"
      onPress={onLeave}
      startIcon={
        <PhoneDisconnectIcon size={20} color={theme.color.onDanger} weight="fill" />
      }
    >
      Leave the call
    </Button>
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
 * The account, and the device identity under it rather than beside it.
 *
 * **When you are signed in, the account is who you are.** That is the decision
 * and it was taken twice, over my own objection both times: the code says the
 * P-256 key joins every server signed in or not, and `chooseTier` falls back to
 * it on a server that does not do accounts, so the two really are both live.
 * But a page offering "Your identity" and "Account" as two top-level rows is
 * asking somebody to choose between them, and there is nothing to choose.
 * GRYT-501.
 *
 * So signed in, the identity is here, under the account, described as what it
 * is used for. Signed out it goes back to the top of the page, where it is the
 * only identity there is.
 *
 * **Hiding the row is fine; making the words unreachable is not.** The
 * twenty-four words are the only unrecoverable thing in the app — the key is
 * worked out from them and stored nowhere else — so this moves the row rather
 * than removing it, and it stays one tap from the You page in both states.
 *
 * What has *not* changed is the join: `chooseTier` still prefers the account
 * and still falls back to the device key on a server that only takes `local`.
 * Refusing those would be what "always the account" means literally, and it
 * would lock a signed-in person out of guest-only servers while orphaning every
 * guest membership they already hold on the key. That is the linking work the
 * identity service was always going to need, and it is GRYT-502 rather than a
 * line changed here.
 *
 * Signing out leaves every membership exactly where it was — which is why there
 * is no second sign-out further down the page. There used to be, it did
 * nothing, and it read as signing out of Gryt entirely.
 */
function AccountRow({ account }: { account: Account }) {
  const theme = useTheme();
  const { state, signIn, signOut } = account;

  if (state.status === "loading") {
    return (
      <Group title="Account">
        <MenuRow
          icon={<UserCircleIcon size={22} color={theme.color.muted} weight="fill" />}
          label="Checking…"
        />
      </Group>
    );
  }

  if (state.status === "signedIn") {
    return (
      <Group title="Account">
        <MenuRow
          icon={<UserCircleIcon size={22} color={theme.color.text} weight="fill" />}
          label={state.profile.label}
          tone="danger"
          onPress={() => confirmSignOut(state.profile.label, () => void signOut())}
        />
        <MenuRow
          icon={<KeyIcon size={22} color={theme.color.muted} weight="fill" />}
          label="Your twenty-four words"
          /* The one hint on a row whose label does not explain itself. Without
           * it this reads as a second login sitting under the first, which is
           * the whole thing the move is undoing. */
          hint="Used on servers that do not take Gryt accounts"
          onPress={() => router.push("/identity")}
        />
      </Group>
    );
  }

  return (
    <Group title="Account">
      <MenuRow
        icon={<UserCircleIcon size={22} color={theme.color.text} weight="fill" />}
        label={state.status === "signingIn" ? "Opening the browser…" : "Sign in to Gryt"}
        /* The error is the one hint kept, because it is not restating the
         * label — it is the only place the reason for a failed sign-in
         * appears at all. */
        hint={state.status === "error" ? state.message : undefined}
        onPress={state.status === "signingIn" ? undefined : () => void signIn()}
      />
    </Group>
  );
}

/**
 * "Sign out of <name>?", once more, before it happens.
 *
 * An `ActionSheetIOS` rather than a Dialog, for the reason leaving a server
 * uses one: it is a `UIAlertController` presented by UIKit rather than a React
 * Native modal, so it does not have to wait for anything else to finish
 * dismissing first.
 *
 * **The message is the point, more than the confirmation is.** The fear this
 * is answering is losing your servers, and signing out does not touch them:
 * the device's key is what joined them and it stays. Somebody who thinks
 * otherwise will not sign out at all, and somebody who signs out expecting to
 * be wiped is in for a surprise the other way. So it says so.
 */
function confirmSignOut(label: string, onSignOut: () => void) {
  if (Platform.OS !== "ios") {
    onSignOut();
    return;
  }

  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: "Sign out of Gryt?",
      message: `${label}\n\nYour servers and your twenty-four words stay exactly as they are. Only the account goes.`,
      options: ["Sign out", "Cancel"],
      destructiveButtonIndex: 0,
      cancelButtonIndex: 1,
      userInterfaceStyle: "dark",
    },
    (index) => {
      if (index === 0) onSignOut();
    },
  );
}
