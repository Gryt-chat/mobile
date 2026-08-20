import { useState, type ReactNode } from "react";
import {
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@gryt/ui-native";

import {
  AVATAR_FRACTION,
  MEET_RADIUS,
  PIP,
  meetLayout,
} from "./meetLayout";

/**
 * The voice view, as it appears inside a sheet on a phone.
 *
 * A mockup. Every participant here is fake and nothing is wired to
 * `@gryt/voice` — the point is to have something to react to before any of it
 * is connected. GRYT-399.
 */

export interface Participant {
  id: string;
  name: string;
  /** Each person gets their own hue; the tile is painted from it. */
  color: string;
  muted?: boolean;
  speaking?: boolean;
  /** Stands in for a camera feed. */
  hasVideo?: boolean;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
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

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: compact ? PIP.radius : MEET_RADIUS,
          backgroundColor: participant.color,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          // Speaking is a ring on the tile rather than a colour change, so it
          // reads at a glance without altering the person's hue.
          borderWidth: participant.speaking ? 2 : 0,
          borderColor: theme.color.accent,
        },
        style,
      ]}
    >
      {participant.hasVideo ? (
        // Stands in for a video feed. A real one is object-fit: cover.
        <View
          style={{
            ...StyleSheetAbsolute,
            backgroundColor: "rgba(255,255,255,0.06)",
          }}
        />
      ) : (
        <View
          style={{
            width: avatar,
            height: avatar,
            borderRadius: avatar / 2,
            backgroundColor: "rgba(0,0,0,0.28)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: "#fff",
              fontSize: avatar * 0.36,
              fontWeight: "600",
            }}
          >
            {initials(participant.name)}
          </Text>
        </View>
      )}

      {/* 16px/500 white, 12 from the left and 9 from the bottom, no scrim —
          the tile's own colour carries the contrast. Measured from Meet. */}
      {!compact ? (
        <Text
          numberOfLines={1}
          style={{
            position: "absolute",
            left: 12,
            bottom: 9,
            right: 34,
            color: "#fff",
            fontSize: 16,
            fontWeight: "500",
          }}
        >
          {participant.name}
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
          <Text style={{ color: "#fff", fontSize: 12 }}>🔇</Text>
        </View>
      ) : null}
    </View>
  );
}

const StyleSheetAbsolute = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

export interface VoiceViewProps {
  participants: Participant[];
  /** The local person, drawn as the picture-in-picture at two people. */
  selfId?: string;
  children?: ReactNode;
}

export function VoiceView({ participants, selfId }: VoiceViewProps) {
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

  const laidOut = heroAndPip ? others : participants;
  const { tiles } = meetLayout(laidOut.length, size.width, size.height);

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
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

      {heroAndPip && self ? (
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

  const Btn = ({
    on,
    label,
    onPress,
    danger,
  }: {
    on?: boolean;
    label: string;
    onPress: () => void;
    danger?: boolean;
  }) => (
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
      <Text style={{ fontSize: 20 }}>{label}</Text>
    </Pressable>
  );

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
      <Btn on={muted} label={muted ? "🔇" : "🎙️"} onPress={() => onToggle("muted")} />
      <Btn on={deafened} label={deafened ? "🔕" : "🎧"} onPress={() => onToggle("deafened")} />
      <Btn on={camera} label="📷" onPress={() => onToggle("camera")} />
      <Btn on={screen} label="🖥️" onPress={() => onToggle("screen")} />
      <Btn danger label="📞" onPress={onLeave} />
    </View>
  );
}
