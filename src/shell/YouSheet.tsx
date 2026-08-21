import { router } from "expo-router";

import { AvatarFace } from "../avatar/AvatarFace";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Divider, Sheet, useTheme } from "@gryt/ui-native";
import { BugIcon } from "phosphor-react-native/src/icons/Bug";
import { FlaskIcon } from "phosphor-react-native/src/icons/Flask";
import { GearSixIcon } from "phosphor-react-native/src/icons/GearSix";
import { HeartIcon } from "phosphor-react-native/src/icons/Heart";
import { MicrophoneIcon } from "phosphor-react-native/src/icons/Microphone";
import { MicrophoneSlashIcon } from "phosphor-react-native/src/icons/MicrophoneSlash";
import { MoonIcon } from "phosphor-react-native/src/icons/Moon";
import { PhoneDisconnectIcon } from "phosphor-react-native/src/icons/PhoneDisconnect";
import { ScreencastIcon } from "phosphor-react-native/src/icons/Screencast";
import { SignOutIcon } from "phosphor-react-native/src/icons/SignOut";
import { SpeakerHighIcon } from "phosphor-react-native/src/icons/SpeakerHigh";
import { SpeakerSlashIcon } from "phosphor-react-native/src/icons/SpeakerSlash";
import { KeyIcon } from "phosphor-react-native/src/icons/Key";
import { UserCircleIcon } from "phosphor-react-native/src/icons/UserCircle";
import { UserIcon } from "phosphor-react-native/src/icons/User";
import { VideoCameraIcon } from "phosphor-react-native/src/icons/VideoCamera";
import { VideoCameraSlashIcon } from "phosphor-react-native/src/icons/VideoCameraSlash";
import { XIcon } from "phosphor-react-native/src/icons/X";

import { useGrytAccount } from "../account/AccountProvider";
import type { Account } from "../account/useAccount";
import { useShell, type VoiceState } from "./ShellContext";
import { ME, STATUS_LABEL, type Status } from "./data";

/**
 * The "you" sheet, behind the avatar.
 *
 * Laid out like the reference: a close button and a title, then you, then the
 * things you can do to yourself, then the things that leave. Contents are the
 * desktop client's own — its avatar menu and its mini controls — rather than
 * the reference's, because the reference's are Slack's features.
 *
 * Two of the reference's rows do survive that, because Gryt has them under
 * different names. "Set yourself as away" is AFK, which the client already has
 * as a timeout in settings and has never had as a switch. "View profile" is the
 * settings "You" panel.
 *
 * What is deliberately not here is a custom status — the "What's your status?"
 * field. `UserStatus` on the server is `online | in_voice | afk | offline`,
 * all derived, and there is no free-text status to write into. A field that
 * accepted one and dropped it would be worse than not offering it.
 *
 * **Everything the body needs is read here and passed down as props**, which
 * looks like an over-correction and is not. `@gorhom/portal` renders the
 * sheet's children in a different React tree, and context does not survive
 * that — so `useShell` inside `Sheet.Content` throws "must be used inside
 * ShellProvider" from a component that visibly *is* inside one. `useTheme`
 * works only because the Sheet re-provides it on the far side of the portal. A
 * sheet of plain text would never show this, which is how it would ship.
 */
export function YouSheet() {
  const { youOpen, setYouOpen, status, voice, toggleVoice } = useShell();
  // Read here, on this side of the portal, for the reason above.
  const account = useGrytAccount();

  return (
    <Sheet snapPoints={["78%"]} open={youOpen} onOpenChange={setYouOpen}>
      <Sheet.Content style={{ padding: 0 }}>
        <YouSheetBody
          status={status}
          voice={voice}
          toggleVoice={toggleVoice}
          account={account}
          onClose={() => setYouOpen(false)}
        />
      </Sheet.Content>
    </Sheet>
  );
}

interface YouSheetBodyProps {
  status: Status;
  voice: VoiceState;
  toggleVoice: (key: keyof VoiceState) => void;
  account: Account;
  onClose: () => void;
}

function YouSheetBody({ status, voice, toggleVoice, account, onClose }: YouSheetBodyProps) {
  const theme = useTheme();

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: theme.space(4),
          paddingBottom: theme.space(3),
        }}
      >
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: theme.radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
          })}
        >
          <XIcon size={18} color={theme.color.text} weight="bold" />
        </Pressable>
        <Text
          style={{
            flex: 1,
            textAlign: "center",
            color: theme.color.text,
            fontSize: 17,
            fontWeight: "700",
            // Balances the close button, so the title is centred on the sheet
            // rather than on what is left of it.
            marginRight: 36,
          }}
        >
          You
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: theme.space(4), gap: theme.space(4) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
          {/* The generated face, not initials. The tab bar that opens this
              sheet shows the face, and a sheet answering it with "YO" in a
              circle reads as two different people. */}
          <AvatarFace name={ME.name} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.color.text, fontSize: 22, fontWeight: "700" }}>
              {ME.name}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: theme.radius.full,
                  backgroundColor:
                    status === "in_voice" ? theme.color.accent : theme.color.success,
                }}
              />
              <Text style={{ color: theme.color.muted, fontSize: 15 }}>
                {STATUS_LABEL[status]}
              </Text>
            </View>
          </View>
        </View>

        {/* The desktop client's MiniControls, in its order: mic, deafen,
            camera, screen share, then disconnect. Server-forced mute is not
            modelled — there is no server to force it. */}
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
          <ControlButton
            label="Camera"
            active={voice.camera}
            tone="accent"
            onPress={() => toggleVoice("camera")}
            icon={
              voice.camera ? (
                <VideoCameraIcon size={22} color={theme.color.onAccent} weight="fill" />
              ) : (
                <VideoCameraSlashIcon size={22} color={theme.color.text} weight="fill" />
              )
            }
          />
          <ControlButton
            label="Share"
            active={voice.screen}
            tone="accent"
            onPress={() => toggleVoice("screen")}
            icon={
              <ScreencastIcon
                size={22}
                color={voice.screen ? theme.color.onAccent : theme.color.text}
                weight="fill"
              />
            }
          />
          <ControlButton
            label="Leave"
            active
            onPress={() => {}}
            icon={<PhoneDisconnectIcon size={22} color={theme.color.onDanger} weight="fill" />}
          />
        </View>

        <View>
          <MenuRow
            icon={<MoonIcon size={22} color={theme.color.text} weight="fill" />}
            label="Set yourself as away"
            hint="AFK, which otherwise happens on a timeout"
          />
          <MenuRow
            icon={<UserIcon size={22} color={theme.color.text} weight="fill" />}
            label="View profile"
          />
          <MenuRow
            icon={<KeyIcon size={22} color={theme.color.text} weight="fill" />}
            label="Your identity"
            hint="The twenty-four words that are you"
            onPress={() => {
              onClose();
              router.push("/identity");
            }}
          />
          <AccountRow account={account} />
        </View>

        <Divider />

        <View>
          <MenuRow
            icon={<GearSixIcon size={22} color={theme.color.text} weight="fill" />}
            label="Settings"
          />
          <MenuRow
            icon={<HeartIcon size={22} color={theme.color.text} weight="fill" />}
            label="Give feedback"
          />
          <MenuRow
            icon={<BugIcon size={22} color={theme.color.text} weight="fill" />}
            label="Report a bug"
          />
          {/* The desktop client gates its Developer section on a dev build.
              Same section, same gate. */}
          {__DEV__ ? (
            <MenuRow
              icon={<FlaskIcon size={22} color={theme.color.text} weight="fill" />}
              label="Components"
              onPress={() => {
                onClose();
                router.push("/dev");
              }}
            />
          ) : null}
          <MenuRow
            icon={<SignOutIcon size={22} color={theme.color.danger} weight="fill" />}
            label="Sign out"
            tone="danger"
          />
        </View>

        <Text
          style={{
            color: theme.color.muted,
            fontSize: 12,
            textAlign: "center",
            paddingBottom: theme.space(2),
          }}
        >
          {ME.userId}
        </Text>
      </ScrollView>
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
  icon: React.ReactNode;
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
        flex: 1,
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

function MenuRow({
  icon,
  label,
  hint,
  tone,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  tone?: "danger";
  onPress?: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        paddingVertical: theme.space(3),
        paddingHorizontal: theme.space(2),
        borderRadius: theme.radius.md,
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
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
 * membership exactly where it was.
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
