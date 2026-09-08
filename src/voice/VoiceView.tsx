import { useState, type ReactNode } from "react";
import {
  Pressable,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
// **Deep imports, one file per icon, rather than the barrel.** Metro does not
// tree-shake: measured, 2.9 MB and 1241 modules became 9.0 MB and 4381 for nine.
import { EarIcon } from "phosphor-react-native/src/icons/Ear";
import { EarSlashIcon } from "phosphor-react-native/src/icons/EarSlash";
import { MicrophoneIcon } from "phosphor-react-native/src/icons/Microphone";
import { MicrophoneSlashIcon } from "phosphor-react-native/src/icons/MicrophoneSlash";
import { MonitorIcon } from "phosphor-react-native/src/icons/Monitor";
import { MonitorArrowUpIcon } from "phosphor-react-native/src/icons/MonitorArrowUp";
import { PhoneDisconnectIcon } from "phosphor-react-native/src/icons/PhoneDisconnect";
import { VideoCameraIcon } from "phosphor-react-native/src/icons/VideoCamera";
import { VideoCameraSlashIcon } from "phosphor-react-native/src/icons/VideoCameraSlash";
import { RTCView } from "react-native-webrtc";
import { Text, useTheme } from "@gryt/ui-native";

import type { AudioRoute } from "../../modules/audio-route";
import { PersonAvatar } from "../avatar/PersonAvatar";
import { routeIcon } from "./AudioRoutePicker";
import {
  AVATAR_FRACTION,
  MEET_RADIUS,
  PIP,
  meetLayout,
} from "./meetLayout";

/**
 * The voice view, as it appears inside a sheet on a phone. Every tile here is a
 * stream `@gryt/voice` is actually carrying.
 */

export interface Participant {
  id: string;
  /**
   * What to call them, or null when nobody knows. The member list's `streamID` is
   * the mapping back. **Null is now the narrow case.**
   */
  name: string | null;
  /** Their uploaded picture, or null for the generated face. */
  avatarUrl?: string | null;
  muted?: boolean;
  /**
   * Whether they have turned everybody else off. **Drawn instead of the mute badge,
   * not beside it** — somebody muted can still hear you.
   */
  deafened?: boolean;
  speaking?: boolean;
  /**
   * A video track to draw instead of the face, as `MediaStream.toURL()`. A string
   * because that is what `RTCView` takes, and it keeps a WebRTC type out of here.
   */
  streamURL?: string | null;
  /**
   * Mirrored, which only your own camera is. A self view that is not mirrored reads
   * as somebody else's video of you.
   */
  mirrored?: boolean;
  /**
   * What the picture is of, which decides how it is fitted. **Not inferable from
   * `mirrored`**: a remote camera is not mirrored and was letterboxed like a screen.
   */
  fit?: "face" | "screen";
}

interface TileProps {
  participant: Participant;
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

function Tile({ participant, width, height, style, compact }: TileProps) {
  const theme = useTheme();
  const avatar = Math.min(width, height) * AVATAR_FRACTION;

  /* The face is seeded on the name, and falls back to the stream id so two
     people nobody can name are still drawn as two people rather than as one. */
  const seed = participant.name ?? participant.id;

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: compact ? PIP.radius : MEET_RADIUS,
          backgroundColor: theme.color.surfaceRaised,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          // Speaking is a ring on the tile rather than a fill, so it reads at a
          // glance without repainting the tile.
          borderWidth: participant.speaking ? 2 : 0,
          borderColor: theme.color.accent,
        },
        style,
      ]}
    >
      {participant.streamURL ? (
        /* **`contain`, not `cover`.** Cropping a terminal takes the edges off the
           text, which is what somebody watching a share is trying to read. */
        <RTCView
          streamURL={participant.streamURL}
          /* `contain` for a screen, `cover` for a face: a cropped screen loses the
             text, and a letterboxed face wastes the tile. */
          objectFit={participant.fit === "screen" ? "contain" : "cover"}
          mirror={participant.mirrored}
          style={{ width: "100%", height: "100%" }}
        />
      ) : participant.fit === "screen" ? (
        /* A screen tile with no picture is your own share, which cannot draw itself.
           An icon says it is running; a face would say a person is here. */
        <MonitorArrowUpIcon size={Math.round(avatar * 0.5)} weight="fill" color={theme.color.muted} />
      ) : (
        /* Through `PersonAvatar` rather than `AvatarFace`, so an uploaded picture
           wins as it does on a message row. `bare` — the tile is the ground. */
        <PersonAvatar
          name={seed}
          source={participant.avatarUrl}
          size={avatar}
          variant="bare"
        />
      )}

      {/* 16px/500, 12 from the left and 9 from the bottom, no scrim. Measured
          from Meet. */}
      {!compact ? (
        <Text
          numberOfLines={1}
          style={{
            position: "absolute",
            left: 12,
            bottom: 9,
            right: 34,
            color: theme.color.text,
            fontSize: 16,
            fontWeight: "500",
          }}
        >
          {participant.name ?? "Someone"}
        </Text>
      ) : null}

      {participant.deafened || participant.muted ? (
        <View
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: "rgba(0,0,0,0.35)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {participant.deafened ? (
            <EarSlashIcon size={13} weight="fill" color="#fff" />
          ) : (
            <MicrophoneSlashIcon size={13} weight="fill" color="#fff" />
          )}
        </View>
      ) : null}
    </View>
  );
}

export interface VoiceViewProps {
  participants: Participant[];
  /** The local person, drawn as the picture-in-picture at two people. */
  selfId?: string;
  /** Screen shares, pinned full width above everyone. */
  shares?: Participant[];
  children?: ReactNode;
}

export function VoiceView({ participants, selfId, shares = [] }: VoiceViewProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height },
    );
  };

  const self = participants.find((p) => p.id === selfId);
  const others = participants.filter((p) => p.id !== selfId);

  // Hero plus picture-in-picture, which the optimiser would not produce — it
  // would stack them. Deliberately special-cased; see meetLayout.ts.
  const heroAndPip = self != null && others.length === 1;

  // A share cancels the hero-plus-PiP arrangement: the share is the thing
  // being looked at, so the people go back to being a row of equals under it.
  const withShare = shares.length > 0;
  const laidOut = heroAndPip && !withShare ? others : participants;
  const { tiles, shares: shareBoxes } = meetLayout(
    laidOut.length,
    size.width,
    size.height,
    shares.length,
  );

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      {shareBoxes.map((box, i) => {
        const p = shares[i];
        if (!p) return null;
        return (
          <Tile
            key={`share-${p.id}`}
            participant={p}
            width={box.width}
            height={box.height}
            style={{ position: "absolute", left: box.x, top: box.y }}
          />
        );
      })}

      {tiles.map((box, i) => {
        const p = laidOut[i];
        if (!p) return null;
        return (
          <Tile
            key={p.id}
            participant={p}
            width={box.width}
            height={box.height}
            style={{ position: "absolute", left: box.x, top: box.y }}
          />
        );
      })}

      {heroAndPip && !withShare && self ? (
        <Tile
          participant={self}
          width={PIP.width}
          height={PIP.height}
          compact
          style={{
            position: "absolute",
            right: PIP.inset,
            bottom: PIP.inset,
          }}
        />
      ) : null}
    </View>
  );
}

export interface VoiceControlsProps {
  muted: boolean;
  deafened: boolean;
  camera?: boolean;
  screen?: boolean;
  /**
   * Between the tap and the first frame. On iOS that gap is a system sheet and a
   * countdown, and an unchanged button reads as a tap that missed.
   */
  screenWaiting?: boolean;
  onToggle: (key: "muted" | "deafened" | "camera" | "screen") => void;
  onLeave: () => void;
  /** Where the call is coming out, so the button can say so. */
  route: AudioRoute | null;
  /** Whether the picker is showing, so the button reads as pressed. */
  routeOpen: boolean;
  onRoute: () => void;
}

/**
 * Mute, deafen, output, leave. **The output button wears the route's own icon
 * rather than a loudspeaker** — a speaker glyph while the call is in AirPods lies.
 */
export function VoiceControls({
  muted,
  deafened,
  camera = false,
  screen = false,
  screenWaiting = false,
  onToggle,
  onLeave,
  route,
  routeOpen,
  onRoute,
}: VoiceControlsProps) {
  const theme = useTheme();

  /**
   * Phosphor, the same set and weights the web uses. **`fill` rather than `bold` on
   * the "off" states** — the slashed variant is legible at 22px filled.
   */
  const Btn = ({
    on,
    danger,
    icon,
    label,
    onPress,
  }: {
    on?: boolean;
    danger?: boolean;
    icon: (color: string) => ReactNode;
    /* Six round buttons with no text between them. VoiceOver has nothing else
       to go on, and the output one's icon changes with the route. */
    label: string;
    onPress: () => void;
  }) => {
    const tint = danger
      ? theme.color.onAccent
      : on
        ? theme.color.onAccent
        : theme.color.text;
    return (
      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: on }}
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: danger
            ? theme.color.danger
            : on
              ? theme.color.accent
              : theme.color.surfaceRaised,
        }}
      >
        {icon(tint)}
      </Pressable>
    );
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        paddingVertical: 12,
      }}
    >
      {/* ── One weight, and the button says the state ─────────────────
       *
       * `Btn` already draws an accent background and flips the tint when a
       * control is on, so weight was a third signal saying the same thing —
       * and it drifted into saying the opposite. It was `fill` for muted and
       * deafened, which are *off* states, and `fill` for camera and screen,
       * which are *on* ones. Every icon here is `fill`; the slash says what is
       * happening and the background says whether it is engaged.
       *
       * The pairs are the same object twice. Deafen was `Headphones` against
       * `SpeakerSlash` — two different things, so the off state did not read as
       * the on state crossed out. There is no `HeadphonesSlash` in Phosphor, and
       * `SpeakerHigh` is taken by the output button sitting next to this one, so
       * it is `Ear` and `EarSlash`: deafen is about you not hearing rather than
       * about a speaker. Screen share was `Screencast` against `MonitorArrowUp`
       * and is now `Monitor` with and without the arrow.
       */}
      <Btn
        on={muted}
        label={muted ? "Unmute" : "Mute"}
        onPress={() => onToggle("muted")}
        icon={(c) =>
          muted ? (
            <MicrophoneSlashIcon size={22} weight="fill" color={c} />
          ) : (
            <MicrophoneIcon size={22} weight="fill" color={c} />
          )
        }
      />
      <Btn
        on={deafened}
        label={deafened ? "Undeafen" : "Deafen"}
        onPress={() => onToggle("deafened")}
        icon={(c) =>
          deafened ? (
            <EarSlashIcon size={22} weight="fill" color={c} />
          ) : (
            <EarIcon size={22} weight="fill" color={c} />
          )
        }
      />
      <Btn
        on={camera}
        label={camera ? "Turn the camera off" : "Turn the camera on"}
        onPress={() => onToggle("camera")}
        icon={(c) =>
          camera ? (
            <VideoCameraIcon size={22} weight="fill" color={c} />
          ) : (
            <VideoCameraSlashIcon size={22} weight="fill" color={c} />
          )
        }
      />
      <Btn
        on={screen || screenWaiting}
        label={
          screenWaiting
            ? "Waiting for the screen share to start"
            : screen
              ? "Stop sharing your screen"
              : "Share your screen"
        }
        onPress={() => onToggle("screen")}
        icon={(c) =>
          screen || screenWaiting ? (
            <MonitorArrowUpIcon size={22} weight="fill" color={c} />
          ) : (
            <MonitorIcon size={22} weight="fill" color={c} />
          )
        }
      />
      <Btn
        on={routeOpen}
        label={route ? `Output: ${route.name}` : "Choose output"}
        onPress={onRoute}
        icon={(c) => routeIcon(route?.kind, 22, c)}
      />
      <Btn danger label="Leave" onPress={onLeave} icon={(c) => <PhoneDisconnectIcon size={22} weight="fill" color={c} />} />
    </View>
  );
}
