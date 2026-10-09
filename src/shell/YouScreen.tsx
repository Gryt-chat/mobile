import { useState } from "react";
import { router } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text, useTheme } from "@gryt/ui-native";
import { BugIcon } from "phosphor-react-native/src/icons/Bug";
import { FlaskIcon } from "phosphor-react-native/src/icons/Flask";
import { GearSixIcon } from "phosphor-react-native/src/icons/GearSix";
import { KeyIcon } from "phosphor-react-native/src/icons/Key";
import { LightbulbIcon } from "phosphor-react-native/src/icons/Lightbulb";
import { PhoneDisconnectIcon } from "phosphor-react-native/src/icons/PhoneDisconnect";
import { QrCodeIcon } from "phosphor-react-native/src/icons/QrCode";
import { UserCircleIcon } from "phosphor-react-native/src/icons/UserCircle";

import { EditMyCard } from "../card/EditMyCard";
import { MyCard } from "../card/MyCard";
import { ProfileCard } from "../profile/ProfileCard";
import { TourTarget } from "../onboarding/tourTargets";
import { useProfileState } from "../profile/ProfileProvider";
import { useGrytAccount } from "../account/AccountProvider";
import { maskEmail } from "../account/maskEmail";
import type { Account } from "../account/useAccount";
import { reportLook } from "../feedback/reportLook";
import { MenuGroup, MenuRow } from "../ui/MenuGroup";
import { Wash } from "../ui/PageHeader";
import { useShell } from "./ShellContext";
import { useTabBarSpace } from "./TabBar";
import { useMe } from "./useMe";

/**
 * The You tab, as a page rather than a sheet — a sheet meant a flag that could disagree
 * with the route. **No custom status**: `UserStatus` has no free-text field.
 */
export function YouScreen() {
  const tabBarSpace = useTabBarSpace();
  const theme = useTheme();
  const [editingCard, setEditingCard] = useState(false);
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
             `useTabBarSpace` already covers the safe area. */
          paddingBottom: tabBarSpace + theme.space(4),
        }}
      >
        {/* No page title above this. The sheet had one — "You", centred, with a
            close button beside it — and on a page it read as a modal that
            forgot to be one, sitting directly above a name that is *also*
            "You" when you are signed out. Your own name is the title. */}
        <TourTarget id="profile-card">
          <ProfileCard
            profile={profile}
            serverName={server?.name ?? null}
            fallbackName={me.name}
            card={server ? (edit) => <MyCard onEdit={() => setEditingCard(true)} {...edit} /> : undefined}
          />
        </TourTarget>

        <Controls inCall={voiceChannel !== null} onLeave={() => setVoiceChannel(null)} />

        {/* Descriptions are gone from every row. They were explaining labels
            that did not need it — "Opens the issue tracker" under "Report a
            bug" — and the second line took each row from about 62pt to 48pt
            for nothing. Still above the 44pt minimum, which is the reason not
            to take anything else out. */}
        <MenuGroup>
          {/* Signed out, the identity is who you are. Signed in, it's under the account,
              as the fallback it is (GRYT-501). */}
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
          {__DEV__ ? (
            <MenuRow
              icon={<FlaskIcon size={22} color={theme.color.text} weight="fill" />}
              label="Components"
              onPress={() => router.push("/dev")}
            />
          ) : null}
        </MenuGroup>
        <EditMyCard open={editingCard} onClose={() => setEditingCard(false)} />

        <TourTarget id="account-row">
          <AccountRow account={account} />
        </TourTarget>

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
            Help make Gryt better
          </Text>
          <View style={{ flexDirection: "row", gap: theme.space(3) }}>
            <HelpTile kind="bug" />
            <HelpTile kind="feedback" />
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

/**
 * The one control on this page, and only while there is a call. **Leave is only
 * there when there is something to leave** — it used to be permanent and inert.
 */
function Controls({ inCall, onLeave }: { inCall: boolean; onLeave: () => void }) {
  const theme = useTheme();

  if (!inCall) return null;

  /* `Button`, not the icon tile this row used to be. One of anything is a button, and
   * it gets a label, which an icon-only leave button could badly use. */
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
 * The account, and the device identity under it. **When you are signed in, the account
 * is who you are**, and **the twenty-four words stay reachable** (GRYT-501).
 */
function AccountRow({ account }: { account: Account }) {
  const theme = useTheme();
  const { state, signIn } = account;

  if (state.status === "loading") {
    return (
      <MenuGroup title="Account">
        <MenuRow
          icon={<UserCircleIcon size={22} color={theme.color.muted} weight="fill" />}
          label="Checking…"
        />
      </MenuGroup>
    );
  }

  if (state.status === "signedIn") {
    return (
      <MenuGroup>
        <MenuRow
          icon={<UserCircleIcon size={22} color={theme.color.text} weight="fill" />}
          label="Gryt account"
          hint={state.profile.email ? maskEmail(state.profile.email) : state.profile.label}
          onPress={() => router.push("/account")}
        />
      </MenuGroup>
    );
  }

  return (
    <MenuGroup title="Account">
      <MenuRow
        icon={<UserCircleIcon size={22} color={theme.color.text} weight="fill" />}
        label={state.status === "signingIn" ? "Opening the browser…" : "Sign in to Gryt"}
        /* The error is the one hint kept, because it is the only place the reason
         * for a failed sign-in appears at all. */
        hint={state.status === "error" ? state.message : undefined}
        onPress={state.status === "signingIn" ? undefined : () => void signIn()}
      />
      <MenuRow
        icon={<QrCodeIcon size={22} color={theme.color.text} weight="fill" />}
        label="Link from another device"
        onPress={() => router.push("/link-from-device")}
      />
    </MenuGroup>
  );
}

/** Report a bug or give feedback: a tile each, in its own colour, so neither reads as the other. */
function HelpTile({ kind }: { kind: "bug" | "feedback" }) {
  const theme = useTheme();
  const look = reportLook(kind, theme);
  const Icon = kind === "bug" ? BugIcon : LightbulbIcon;

  return (
    <Pressable
      onPress={() => router.push(`/report?type=${kind}`)}
      accessibilityRole="button"
      accessibilityLabel={look.title}
      style={({ pressed }) => ({
        flex: 1,
        gap: theme.space(2),
        padding: theme.space(4),
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surface,
        overflow: "hidden",
      })}
    >
      <Wash colour={look.colour} strength={0.1} />
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: theme.radius.md,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <Wash colour={look.colour} strength={0.22} />
        <Icon size={22} color={look.colour} weight="fill" />
      </View>
      <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "700" }}>{look.title}</Text>
      <Text style={{ color: theme.color.muted, fontSize: 13 }}>{look.tagline}</Text>
    </Pressable>
  );
}
