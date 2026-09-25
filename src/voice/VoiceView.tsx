import { useEffect, useState, type ReactNode } from "react";
import {
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
// **Deep imports, one file per icon, rather than the barrel.** Metro does not
// tree-shake: measured, 2.9 MB and 1241 modules became 9.0 MB and 4381 for nine.
import { EarSlashIcon } from "phosphor-react-native/src/icons/EarSlash";
import { MicrophoneSlashIcon } from "phosphor-react-native/src/icons/MicrophoneSlash";
import { MonitorArrowUpIcon } from "phosphor-react-native/src/icons/MonitorArrowUp";
import { RTCView } from "react-native-webrtc";
import { Text, useTheme } from "@gryt/ui-native";

import { PersonAvatar } from "../avatar/PersonAvatar";
import type { DrawnBox } from "./videoDemand";
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
  /** The remote video's stream id, so the SFU hears how big it's drawn. Not set for your own. */
  videoStreamId?: string | null;
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
  /** Each remote video's tile box by stream id, whenever that changes. */
  onDrawn?: (drawn: Map<string, DrawnBox>) => void;
  children?: ReactNode;
}

export function VoiceView({ participants, selfId, shares = [], onDrawn }: VoiceViewProps) {
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

  const drawn = new Map<string, DrawnBox>();
  const addDrawn = (p: Participant | undefined, box: DrawnBox) => {
    const id = p?.streamURL ? p.videoStreamId : null;
    if (!id) return;
    const had = drawn.get(id);
    drawn.set(id, { width: Math.max(box.width, had?.width ?? 0), height: Math.max(box.height, had?.height ?? 0) });
  };
  shareBoxes.forEach((box, i) => addDrawn(shares[i], box));
  tiles.forEach((box, i) => addDrawn(laidOut[i], box));
  const drawnKey = [...drawn].map(([id, b]) => `${id}=${b.width}x${b.height}`).join(",");

  useEffect(() => {
    onDrawn?.(drawn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawnKey]);

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
