import { useState, type ReactNode } from "react";
import {
  Pressable,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
// Deep imports, one file per icon, rather than the barrel.
//
// Metro does not tree-shake, so `from "phosphor-react-native"` pulls the whole
// set in: measured, the bundle went from 2.9 MB and 1241 modules to 9.0 MB and
// 4381 for nine icons. The package exposes `./src/icons/*` as a subpath export
// for exactly this.
//
// Named, and the `*Icon` suffix: the bare names are marked deprecated in the
// package, and `@phosphor-icons/react` 2.1 uses the same suffixed names — so
// this is the spelling that matches the web rather than the one that happens
// to work today.
import { HeadphonesIcon } from "phosphor-react-native/src/icons/Headphones";
import { MicrophoneIcon } from "phosphor-react-native/src/icons/Microphone";
import { MicrophoneSlashIcon } from "phosphor-react-native/src/icons/MicrophoneSlash";
import { MonitorArrowUpIcon } from "phosphor-react-native/src/icons/MonitorArrowUp";
import { PhoneDisconnectIcon } from "phosphor-react-native/src/icons/PhoneDisconnect";
import { ScreencastIcon } from "phosphor-react-native/src/icons/Screencast";
import { SpeakerSlashIcon } from "phosphor-react-native/src/icons/SpeakerSlash";
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
 * The voice view, as it appears inside a sheet on a phone.
 *
 * Started as a mockup in GRYT-399 and is the engine's now: every tile here is a
 * stream `@gryt/voice` is actually carrying.
 *
 * What went with the mockup, in GRYT-467 — a per-person `color`, which every
 * caller set to the same surface; a `hasVideo` flag drawing a translucent grey
 * rectangle where a camera would go, which nothing ever set; and an `initials`
 * helper, which was the visible one. Remote streams arrive without names, so
 * they were labelled `Someone (1)`, and that split on whitespace and took the
 * first letter of each part — putting **"S("** in the middle of the tile.
 */

export interface Participant {
  id: string;
  /**
   * What to call them, or null when nobody knows.
   *
   * Null used to be the ordinary case for a remote stream. `SFUInterface.streams`
   * is keyed by stream id and carries `isLocal` and nothing else — no user id,
   * no nickname — so every remote tile said "Someone", and GRYT-452 recorded
   * that as a boundary needing the engine to change.
   *
   * It did not. The server's member list carries each member's `streamID`,
   * which is the mapping back, so `VoiceSheet` can name a tile. Null is now the
   * narrow case it should always have been: a stream published by somebody the
   * member list has not caught up with yet.
   */
  name: string | null;
  /** Their uploaded picture, or null for the generated face. */
  avatarUrl?: string | null;
  muted?: boolean;
  /**
   * Whether they have turned everybody else off.
   *
   * Drawn instead of the mute badge rather than beside it, because deafened
   * implies muted — the server records both and every client sets both — and
   * two badges in one corner would be saying the same thing twice. It is also
   * the more important half: somebody muted can still hear you, and somebody
   * deafened cannot, which is the thing worth knowing before you talk to them.
   */
  deafened?: boolean;
  speaking?: boolean;
  /**
   * A video track to draw instead of the face, as `MediaStream.toURL()`.
   *
   * A string rather than the `MediaStream` itself, because that is what
   * `RTCView` takes and because it keeps this file free of a WebRTC type — the
   * tile does not care whether it is a screen or a camera, only whether there
   * is a picture.
   */
  streamURL?: string | null;
  /**
   * Mirrored, which only your own camera is.
   *
   * A self view that is not mirrored reads as somebody else's video of you, and
   * every other video app does the same.
   */
  mirrored?: boolean;
  /**
   * What the picture is of, which decides how it is fitted.
   *
   * **Not inferable from `mirrored`**, which was the first attempt and was
   * wrong on screen: a remote camera is not mirrored and was therefore
   * letterboxed like a screen, with bars down both sides of somebody's face.
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
        /* **`contain`, not `cover`.** A face crops well and a screen does not:
           cropping a terminal takes the edges off the text, which is the one
           thing somebody watching a share is trying to read. The letterboxing
           that leaves is the tile's own colour. GRYT-40 says the same about the
           desktop's layout. */
        <RTCView
          streamURL={participant.streamURL}
          /* `contain` for a screen, `cover` for a face. A screen cropped loses
             the edges of the text, which is the thing being read; a face
             letterboxed wastes the tile it was given and puts bars down both
             sides of somebody's head. */
          objectFit={participant.fit === "screen" ? "contain" : "cover"}
          mirror={participant.mirrored}
          style={{ width: "100%", height: "100%" }}
        />
      ) : participant.fit === "screen" ? (
        /* A screen tile with no picture is your own share, which cannot draw
           itself — the screen being shared is this screen. An icon says it is
           running; a generated face would say a person is here. */
        <MonitorArrowUpIcon size={Math.round(avatar * 0.5)} weight="fill" color={theme.color.muted} />
      ) : (
        /* Through `PersonAvatar` rather than straight to `AvatarFace`, so an
           uploaded picture wins here for the same reason and in the same way it
           does on a message row. `bare` because the tile is already the ground. */
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
            <SpeakerSlashIcon size={13} weight="fill" color="#fff" />
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
   * Between the tap and the first frame.
   *
   * On iOS that gap is the whole interaction — a system sheet and a countdown —
   * and a button that looks identical throughout reads as a tap that missed.
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
 * Mute, deafen, output, leave.
 *
 * Camera and screen share were here once with nothing behind them — a control
 * that lights up and does nothing costs a tap to discover and then costs trust
 * in the four beside it. Both are back now there is a track (GRYT-535,
 * GRYT-557).
 *
 * The output button sits beside deafen because the two are the same question
 * asked twice. **It wears the route's own icon rather than a loudspeaker** — a
 * speaker glyph while the call is in somebody's AirPods says something untrue.
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
   * Phosphor, the same icon set and the same weights the web uses — the RN port
   * takes `size`, `weight` and `color` exactly as `@phosphor-icons/react` does,
   * so an icon named here is the icon named there.
   *
   * `fill` rather than `bold` on the "off" states, matching how a muted mic
   * reads on every other voice client: the slashed variant filled is legible at
   * 22px in a way the stroked one is not.
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
      <Btn
        on={muted}
        label={muted ? "Unmute" : "Mute"}
        onPress={() => onToggle("muted")}
        icon={(c) =>
          muted ? (
            <MicrophoneSlashIcon size={22} weight="fill" color={c} />
          ) : (
            <MicrophoneIcon size={22} weight="regular" color={c} />
          )
        }
      />
      <Btn
        on={deafened}
        label={deafened ? "Undeafen" : "Deafen"}
        onPress={() => onToggle("deafened")}
        icon={(c) =>
          deafened ? (
            <SpeakerSlashIcon size={22} weight="fill" color={c} />
          ) : (
            <HeadphonesIcon size={22} weight="regular" color={c} />
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
            <VideoCameraSlashIcon size={22} weight="regular" color={c} />
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
            <ScreencastIcon size={22} weight="regular" color={c} />
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
