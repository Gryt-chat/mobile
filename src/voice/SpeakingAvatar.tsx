import type { ReactNode } from "react";
import { View } from "react-native";
import Animated, { makeMutable, type SharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";

import { avatarSeed, generatedAvatarColour, TILE_HUES } from "../avatar/generatedAvatar";

/*
 * The desktop's speaking treatment (SpeakingHalo.tsx and speakingRingStyle in the client):
 * a disc in the person's hue that grows with how loud they are, and a ring while speaking.
 */

/** How much bigger than the avatar the halo gets at full volume, as on the desktop. */
const HALO_MAX_SCALE = 1.32;
const RING = 2.5;
const RING_GAP = 2;
/** The desktop's level: linear in dB between these, 0 to 1. */
const FLOOR_DB = -55;
const CEIL_DB = -12;

export function levelFromDb(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.min(1, Math.max(0, (db - FLOOR_DB) / (CEIL_DB - FLOOR_DB)));
}

/** WebRTC's audioLevel is linear amplitude, 0 to 1. */
export function levelFromAmplitude(amplitude: number): number {
  return amplitude > 0 ? levelFromDb(20 * Math.log10(amplitude)) : 0;
}

/** The avatar's hue, or null for grey. The desktop's hueFromAvatarColor. */
export function hueFromColour(hex: string | null | undefined): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta < 0.08) return null;
  let h = (r - g) / delta + 4;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  return (h * 60 + 360) % 360;
}

/** A person's hue: their owl's colour, else the desktop's hash into the tile palette. */
export function speakingHue(name: string): number {
  const seed = avatarSeed(name);
  const fromOwl = seed ? hueFromColour(generatedAvatarColour(seed)) : null;
  if (fromOwl !== null) return fromOwl;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return TILE_HUES[Math.abs(hash) % TILE_HUES.length];
}

/* Levels by tile id, written by whoever measures and read on the UI thread, so a level
   changing ten times a second never re-renders the call. */
const levels = new Map<string, SharedValue<number>>();

function levelFor(id: string): SharedValue<number> {
  let v = levels.get(id);
  if (!v) {
    v = makeMutable(0);
    levels.set(id, v);
  }
  return v;
}

/** Each tile's level, 0 to 1; a tile not in `next` falls to 0. Rises fast, falls slowly, as the desktop's halo. */
export function setLevels(next: ReadonlyMap<string, number>): void {
  for (const [id, v] of levels) {
    const level = next.get(id) ?? 0;
    v.value = withTiming(level, { duration: level > v.value ? 60 : 400 });
  }
  for (const [id, level] of next) if (!levels.has(id)) levelFor(id).value = level;
}

export function SpeakingAvatar({
  id,
  hue,
  size,
  speaking,
  children,
}: {
  id: string;
  hue: number;
  size: number;
  speaking: boolean;
  children: ReactNode;
}) {
  const level = levelFor(id);
  const halo = useAnimatedStyle(() => ({
    opacity: 0.18 + level.value * 0.42,
    transform: [{ scale: 1 + level.value * (HALO_MAX_SCALE - 1) }],
  }));
  const outer = size + 2 * (RING + RING_GAP);

  return (
    <View style={{ width: outer, height: outer, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        pointerEvents="none"
        style={[
          { position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue}, 60%, 62%)` },
          halo,
        ]}
      />
      {children}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: outer,
          height: outer,
          borderRadius: outer / 2,
          borderWidth: RING,
          borderColor: speaking ? `hsl(${hue}, 65%, 68%)` : "transparent",
        }}
      />
    </View>
  );
}
