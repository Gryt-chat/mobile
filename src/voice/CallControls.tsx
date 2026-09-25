import { forwardRef, useRef, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { EarIcon } from "phosphor-react-native/src/icons/Ear";
import { EarSlashIcon } from "phosphor-react-native/src/icons/EarSlash";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { LockSimpleIcon } from "phosphor-react-native/src/icons/LockSimple";
import { MicrophoneIcon } from "phosphor-react-native/src/icons/Microphone";
import { MicrophoneSlashIcon } from "phosphor-react-native/src/icons/MicrophoneSlash";
import { MonitorIcon } from "phosphor-react-native/src/icons/Monitor";
import { MonitorArrowUpIcon } from "phosphor-react-native/src/icons/MonitorArrowUp";
import { PhoneDisconnectIcon } from "phosphor-react-native/src/icons/PhoneDisconnect";
import { VideoCameraIcon } from "phosphor-react-native/src/icons/VideoCamera";
import { VideoCameraSlashIcon } from "phosphor-react-native/src/icons/VideoCameraSlash";
import { AnchoredPopup, Text, useTheme, type AnchorRect } from "@gryt/ui-native";

import type { AudioRoute } from "../../modules/audio-route";
import { routeIcon } from "./AudioRoutePicker";
import { callControlColors, hearingState, microphoneState, type CallControlState } from "./callControlState";
import {
  CAMERA_PRESETS,
  presetKey,
  presetLabel,
  SCREEN_PRESETS,
  type QualityPreset,
} from "./streamQuality";

export interface VoiceControlsProps {
  muted: boolean;
  deafened: boolean;
  /** An admin's mute or deafen. The button shows a lock and the press says why. */
  serverMuted?: boolean;
  serverDeafened?: boolean;
  onBlocked?: (what: "muted" | "deafened") => void;
  camera?: boolean;
  screen?: boolean;
  /** Between the tap and the first frame, which on iOS is a system sheet and a countdown. */
  screenWaiting?: boolean;
  /** Whether the room lets you start one. One already on keeps its button, so it can stop. */
  cameraAllowed?: boolean;
  screenAllowed?: boolean;
  cameraPreset: QualityPreset;
  onCameraPreset: (preset: QualityPreset) => void;
  onSwitchCamera: () => void;
  screenPreset: QualityPreset;
  onScreenPreset: (preset: QualityPreset) => void;
  /** Null where the phone has nothing else to share, which is iOS. */
  onSwitchScreen: (() => void) | null;
  /** What this phone's share can't do, said in its menu. */
  screenNote?: string | null;
  onToggle: (key: "muted" | "deafened" | "camera" | "screen") => void;
  onLeave: () => void;
  route: AudioRoute | null;
  routeOpen: boolean;
  onRoute: () => void;
}

/** The call's row of buttons. Off, a camera or share button starts it; live, it opens a menu
    with the quality, a switch and stop, so a stray tap can't end it. */
export function VoiceControls(props: VoiceControlsProps) {
  const {
    muted, deafened, serverMuted = false, serverDeafened = false, onBlocked,
    camera = false, screen = false, screenWaiting = false,
    cameraAllowed = true, screenAllowed = true,
    onToggle, onLeave, route, routeOpen, onRoute,
  } = props;
  const theme = useTheme();
  const [menu, setMenu] = useState<{ kind: "camera" | "screen"; anchor: AnchorRect } | null>(null);
  const cameraButton = useRef<View>(null);
  const screenButton = useRef<View>(null);

  const openMenu = (kind: "camera" | "screen") => {
    const ref = kind === "camera" ? cameraButton : screenButton;
    ref.current?.measureInWindow((x, y, width, height) => setMenu({ kind, anchor: { x, y, width, height } }));
  };

  const mic = microphoneState(muted, serverMuted);
  const hearing = hearingState(deafened, serverDeafened);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 12 }}>
      <CallControlButton
        state={mic}
        label={muted || serverMuted ? "Unmute" : "Mute"}
        onPress={() => (serverMuted ? onBlocked?.("muted") : onToggle("muted"))}
        icon={(c) =>
          muted || serverMuted ? (
            <MicrophoneSlashIcon size={22} weight="fill" color={c} />
          ) : (
            <MicrophoneIcon size={22} weight="fill" color={c} />
          )
        }
      />
      <CallControlButton
        state={hearing}
        label={deafened || serverDeafened ? "Undeafen" : "Deafen"}
        onPress={() => (serverDeafened ? onBlocked?.("deafened") : onToggle("deafened"))}
        icon={(c) =>
          deafened || serverDeafened ? (
            <EarSlashIcon size={22} weight="fill" color={c} />
          ) : (
            <EarIcon size={22} weight="fill" color={c} />
          )
        }
      />
      {camera || cameraAllowed ? (
        <CallControlButton
          ref={cameraButton}
          state={camera ? "live" : "idle"}
          label={camera ? "Camera is on" : "Turn the camera on"}
          onPress={() => (camera ? openMenu("camera") : onToggle("camera"))}
          icon={(c) =>
            camera ? (
              <VideoCameraIcon size={22} weight="fill" color={c} />
            ) : (
              <VideoCameraSlashIcon size={22} weight="fill" color={c} />
            )
          }
        />
      ) : null}
      {screen || screenWaiting || screenAllowed ? (
        <CallControlButton
          ref={screenButton}
          state={screen && !screenWaiting ? "live" : "idle"}
          label={
            screenWaiting
              ? "Waiting for the screen share to start"
              : screen
                ? "Sharing your screen"
                : "Share your screen"
          }
          onPress={() => (screen && !screenWaiting ? openMenu("screen") : onToggle("screen"))}
          icon={(c) =>
            screen || screenWaiting ? (
              <MonitorArrowUpIcon size={22} weight="fill" color={c} />
            ) : (
              <MonitorIcon size={22} weight="fill" color={c} />
            )
          }
        />
      ) : null}
      <CallControlButton
        state="idle"
        selected={routeOpen}
        label={route ? `Output: ${route.name}` : "Choose output"}
        onPress={onRoute}
        icon={(c) => routeIcon(route?.kind, 22, c)}
      />
      <Pressable
        onPress={onLeave}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Leave"
        style={({ pressed }) => ({
          width: 52,
          height: 52,
          borderRadius: 26,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.color.danger,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <PhoneDisconnectIcon size={22} weight="fill" color={theme.color.onDanger} />
      </Pressable>

      <StreamMenu
        open={menu !== null && (menu.kind === "camera" ? camera : screen)}
        anchor={menu?.anchor ?? null}
        onDismiss={() => setMenu(null)}
        label={menu?.kind === "screen" ? "Screen share" : "Camera"}
        presets={menu?.kind === "screen" ? SCREEN_PRESETS : CAMERA_PRESETS}
        current={menu?.kind === "screen" ? props.screenPreset : props.cameraPreset}
        onPreset={menu?.kind === "screen" ? props.onScreenPreset : props.onCameraPreset}
        switchLabel={menu?.kind === "screen" ? "Share something else" : "Switch camera"}
        onSwitch={menu?.kind === "screen" ? props.onSwitchScreen : props.onSwitchCamera}
        note={menu?.kind === "screen" ? props.screenNote ?? null : null}
        stopLabel={menu?.kind === "screen" ? "Stop sharing" : "Turn camera off"}
        onStop={() => onToggle(menu?.kind === "screen" ? "screen" : "camera")}
      />
    </View>
  );
}

interface CallControlButtonProps {
  state: CallControlState;
  label: string;
  icon: (color: string) => ReactNode;
  onPress: () => void;
  selected?: boolean;
}

/** `ground` is the resting fill on a surface already raised, where the default would vanish. */
export const CallControlButton = forwardRef<View, CallControlButtonProps & { size?: number; ground?: string }>(
  function CallControlButton({ state, label, icon, onPress, selected, size = 52, ground }, ref) {
    const theme = useTheme();
    const colors = callControlColors(theme, state);
    const resting = ground && state === "idle" ? ground : colors.background;
    return (
      <Pressable
        ref={ref}
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, disabled: state === "blocked" || undefined }}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed || selected ? colors.pressed : resting,
          borderWidth: ground ? 1 : 0,
          borderColor: theme.color.border,
          opacity: colors.opacity,
        })}
      >
        {icon(colors.tint)}
        {state === "blocked" ? (
          <View style={{ position: "absolute", right: size * 0.16, bottom: size * 0.16 }}>
            <LockSimpleIcon size={Math.round(size / 4.3)} weight="fill" color={colors.tint} />
          </View>
        ) : null}
      </Pressable>
    );
  },
);

function StreamMenu({
  open,
  anchor,
  onDismiss,
  label,
  presets,
  current,
  onPreset,
  switchLabel,
  onSwitch,
  note,
  stopLabel,
  onStop,
}: {
  open: boolean;
  anchor: AnchorRect | null;
  onDismiss: () => void;
  label: string;
  presets: QualityPreset[];
  current: QualityPreset;
  onPreset: (preset: QualityPreset) => void;
  switchLabel: string;
  onSwitch: (() => void) | null;
  note: string | null;
  stopLabel: string;
  onStop: () => void;
}) {
  const theme = useTheme();
  const chosen = presetKey(current);
  const listed = presets.some((p) => presetKey(p) === chosen) ? presets : [current, ...presets];
  const pick = (run: () => void) => () => {
    onDismiss();
    run();
  };
  const row = { paddingHorizontal: theme.space(4), paddingVertical: theme.space(2.5) };
  const rule = <View style={{ height: 1, backgroundColor: theme.color.border, marginVertical: theme.space(1) }} />;

  return (
    <AnchoredPopup
      open={open}
      anchor={anchor}
      onDismiss={onDismiss}
      side="top"
      align="center"
      sideOffset={8}
      style={{ paddingVertical: theme.space(1), minWidth: 230 }}
    >
      <View accessibilityRole="menu" accessibilityLabel={label}>
        <Text style={{ ...row, paddingBottom: theme.space(1), color: theme.color.muted, fontSize: 12, fontWeight: "600" }}>
          Quality
        </Text>
        {listed.map((preset) => {
          const on = presetKey(preset) === chosen;
          return (
            <Pressable
              key={presetKey(preset)}
              accessibilityRole="menuitem"
              accessibilityLabel={`${presetLabel(preset)}, ${preset.hint}`}
              accessibilityState={{ checked: on }}
              onPress={pick(() => onPreset(preset))}
              style={({ pressed }) => ({
                ...row,
                flexDirection: "row",
                alignItems: "center",
                gap: theme.space(2),
                backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
              })}
            >
              <View style={{ width: 16 }}>{on ? <CheckIcon size={16} weight="bold" color={theme.color.text} /> : null}</View>
              <Text style={{ color: theme.color.text, fontSize: 14 }}>{presetLabel(preset)}</Text>
              <Text style={{ color: theme.color.muted, fontSize: 12, marginLeft: "auto" }}>{preset.hint}</Text>
            </Pressable>
          );
        })}
        {rule}
        {note ? (
          <Text style={{ ...row, maxWidth: 280, color: theme.color.muted, fontSize: 12 }}>{note}</Text>
        ) : null}
        {onSwitch ? (
          <Pressable
            accessibilityRole="menuitem"
            onPress={pick(onSwitch)}
            style={({ pressed }) => ({ ...row, backgroundColor: pressed ? theme.color.surfaceHover : "transparent" })}
          >
            <Text style={{ color: theme.color.text, fontSize: 14 }}>{switchLabel}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="menuitem"
          onPress={pick(onStop)}
          style={({ pressed }) => ({ ...row, backgroundColor: pressed ? theme.color.surfaceHover : "transparent" })}
        >
          <Text style={{ color: theme.scales.danger[10], fontSize: 14 }}>{stopLabel}</Text>
        </Pressable>
      </View>
    </AnchoredPopup>
  );
}
