import { cameraBitrate, QUALITY_CONSTRAINTS, screenBitrate } from "@gryt/voice/native";

import type { QualityTools } from "./streamQuality";

export const QUALITY_TOOLS: QualityTools = { QUALITY_CONSTRAINTS, cameraBitrate, screenBitrate };

/** A track's size, when react-native-webrtc knows it. */
export function sourceOf(track: { getSettings: () => { width?: number; height?: number } }) {
  const { width, height } = track.getSettings();
  return width && height ? { width, height } : null;
}
