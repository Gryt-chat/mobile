import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Avatar, Divider, Sheet, useTheme } from "@gryt/ui-native";
import { BugIcon } from "phosphor-react-native/src/icons/Bug";
import { FlaskIcon } from "phosphor-react-native/src/icons/Flask";
import { GearSixIcon } from "phosphor-react-native/src/icons/GearSix";
import { HeartIcon } from "phosphor-react-native/src/icons/Heart";
import { MicrophoneIcon } from "phosphor-react-native/src/icons/Microphone";
import { MicrophoneSlashIcon } from "phosphor-react-native/src/icons/MicrophoneSlash";
import { PhoneDisconnectIcon } from "phosphor-react-native/src/icons/PhoneDisconnect";
import { ScreencastIcon } from "phosphor-react-native/src/icons/Screencast";
import { SignOutIcon } from "phosphor-react-native/src/icons/SignOut";
import { SpeakerHighIcon } from "phosphor-react-native/src/icons/SpeakerHigh";
import { SpeakerSlashIcon } from "phosphor-react-native/src/icons/SpeakerSlash";
import { VideoCameraIcon } from "phosphor-react-native/src/icons/VideoCamera";
import { VideoCameraSlashIcon } from "phosphor-react-native/src/icons/VideoCameraSlash";

import { useShell } from "./ShellContext";
import { ME, STATUS_LABEL } from "./data";

/**
 * The "you" sheet, behind the avatar in the tab bar.
 *
 * Contents are the desktop client's avatar menu and its mini controls, in the
 * order they appear there: the voice controls, then Settings, Give feedback,
 * Report a bug, Sign out. The user id at the bottom is what the settings "You"
 * panel pins there.
 *
 * There is no status *picker*. `UserStatus` on the client is derived — online,
 * in voice, AFK, offline — and the only thing resembling a manual control is
 * the AFK timeout in settings. A picker here would be inventing a feature the
 * server does not have, so the status is shown and not offered.
 *
 * Mounted and unmounted rather than held open, because `Sheet` is
 * uncontrolled: it takes `defaultOpen` and a `Trigger`, and nothing else in the
 * package works that way — `useOpenState`'s own comment says every overlay here
 * accepts `open` with `onOpenChange`. Sheet is the exception. Remounting is the
 * workaround; ui#95 adds the prop, and this goes back to being a plain
 * `open={youOpen}` once that is published.
 */
export function YouSheet() {
  const { youOpen, setYouOpen } = useShell();

  if (!youOpen) return null;

  return (
    <Sheet
      snapPoints={["62%"]}
      defaultOpen
      onOpenChange={(open) => {
        if (!open) setYouOpen(false);
      }}
    >
      <Sheet.Content>
        <YouSheetBody />
      </Sheet.Content>
    </Sheet>
  );
}

function YouSheetBody() {
  const theme = useTheme();
  const { status, voice, toggleVoice, setYouOpen } = useShell();

  return (
    <View style={{ gap: theme.space(4) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
        <Avatar name={ME.name} size="lg" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.color.text, fontSize: 20, fontWeight: "700" }}>
            {ME.name}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: theme.radius.full,
                backgroundColor: status === "in_voice" ? theme.color.accent : theme.color.success,
              }}
            />
            <Text style={{ color: theme.color.muted, fontSize: 14 }}>{STATUS_LABEL[status]}</Text>
          </View>
        </View>
      </View>

      {/* The desktop client's MiniControls, in its order: mic, deafen, camera,
          screen share, then disconnect. Server-forced mute is not modelled
          here — there is no server to force it. */}
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

      <Divider />

      <View>
        <MenuRow icon={<GearSixIcon size={20} color={theme.color.text} weight="fill" />} label="Settings" />
        <MenuRow icon={<HeartIcon size={20} color={theme.color.text} weight="fill" />} label="Give feedback" />
        <MenuRow icon={<BugIcon size={20} color={theme.color.text} weight="fill" />} label="Report a bug" />
        {/* The desktop client gates its Developer section on a dev build. This
            is the same section and the same gate. */}
        {__DEV__ ? (
          <MenuRow
            icon={<FlaskIcon size={20} color={theme.color.text} weight="fill" />}
            label="Components"
            onPress={() => {
              setYouOpen(false);
              router.push("/dev");
            }}
          />
        ) : null}
        <MenuRow
          icon={<SignOutIcon size={20} color={theme.color.danger} weight="fill" />}
          label="Sign out"
          tone="danger"
        />
      </View>

      <Text style={{ color: theme.color.muted, fontSize: 12, textAlign: "center" }}>
        {ME.userId}
      </Text>
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
  tone,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
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
      <Text
        style={{
          color: tone === "danger" ? theme.color.danger : theme.color.text,
          fontSize: 16,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
