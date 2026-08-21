import { useState, type ReactNode } from "react";
import {
  Pressable,
  Text,
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
import { MonitorIcon } from "phosphor-react-native/src/icons/Monitor";
import { PhoneDisconnectIcon } from "phosphor-react-native/src/icons/PhoneDisconnect";
import { SpeakerSlashIcon } from "phosphor-react-native/src/icons/SpeakerSlash";
import { VideoCameraIcon } from "phosphor-react-native/src/icons/VideoCamera";
import { VideoCameraSlashIcon } from "phosphor-react-native/src/icons/VideoCameraSlash";
import { useTheme } from "@gryt/ui-native";

import { AvatarFace } from "../avatar/AvatarFace";
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
   * Null is the ordinary case for a remote stream rather than an error:
   * `SFUInterface.streams` is keyed by stream id and carries `isLocal` and
   * nothing else — no user id, no nickname — and the socket sends no member
   * list either. GRYT-452 records that boundary.
   */
  name: string | null;
  muted?: boolean;
  speaking?: boolean;
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
      <AvatarFace name={seed} size={avatar} disc />

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

      {participant.muted ? (
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
          <MicrophoneSlashIcon size={13} weight="fill" color="#fff" />
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
  camera: boolean;
  screen: boolean;
  onToggle: (key: "muted" | "deafened" | "camera" | "screen") => void;
  onLeave: () => void;
}

/**
 * Mute, deafen, camera, screen share, leave.
 *
 * Deafen has no equivalent in the Meet reference — it is a Gryt concept and
 * sits with mute because that is where the desktop client keeps it.
 */
export function VoiceControls({
  muted,
  deafened,
  camera,
  screen,
  onToggle,
  onLeave,
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
    onPress,
  }: {
    on?: boolean;
    danger?: boolean;
    icon: (color: string) => ReactNode;
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
        on={screen}
        onPress={() => onToggle("screen")}
        icon={(c) => <MonitorIcon size={22} weight={screen ? "fill" : "regular"} color={c} />}
      />
      <Btn danger onPress={onLeave} icon={(c) => <PhoneDisconnectIcon size={22} weight="fill" color={c} />} />
    </View>
  );
}
