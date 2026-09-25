import type { CaptureQuality, VideoSendSettings } from "@gryt/voice/native";

/** One in-call quality choice. A ceiling rather than a size: the engine sends less when
    nobody draws it that big. The presets are the web client's `streamQuality.ts`. */
export interface QualityPreset {
  quality: CaptureQuality;
  fps: number;
  hint: string;
}

export const SCREEN_PRESETS: QualityPreset[] = [
  { quality: "native", fps: 30, hint: "Sharpest text" },
  { quality: "1080p", fps: 60, hint: "Smoothest motion" },
  { quality: "720p", fps: 30, hint: "Uses less data" },
];

export const CAMERA_PRESETS: QualityPreset[] = [
  { quality: "native", fps: 30, hint: "Sharpest" },
  { quality: "720p", fps: 30, hint: "HD" },
  { quality: "360p", fps: 15, hint: "Uses less data" },
];

/** What the phone sent before there was a choice: the camera opens at 720p, a share at native. */
export const DEFAULT_CAMERA_PRESET = CAMERA_PRESETS[1];
export const DEFAULT_SCREEN_PRESET = SCREEN_PRESETS[0];

/** The front camera's widest capture, which "native" lifts it to. It opens at 720p. */
export const CAMERA_NATIVE_CAPTURE = { width: 1920, height: 1080 };

export function presetKey(preset: Pick<QualityPreset, "quality" | "fps">): string {
  return `${preset.quality}@${preset.fps}`;
}

export function presetLabel(preset: Pick<QualityPreset, "quality" | "fps">): string {
  const quality = preset.quality === "native" ? "Native" : preset.quality === "4k" ? "4K" : preset.quality;
  return `${quality} · ${preset.fps} fps`;
}

/** What the engine exports for this, passed in so a test can use the web entry. */
export interface QualityTools {
  QUALITY_CONSTRAINTS: Record<CaptureQuality, { width?: number; height?: number }>;
  cameraBitrate: (width: number, height: number, fps: number) => number;
  screenBitrate: (height: number, fps: number) => number;
}

interface Size {
  width: number;
  height: number;
}

/** The preset's box, turned to match the source. The engine divides width by width, so a
    landscape box over a portrait phone screen would shrink it to half of what was asked. */
export function ceilingFor(quality: CaptureQuality, source: Size | null, tools: QualityTools): Size | null {
  const c = tools.QUALITY_CONSTRAINTS[quality];
  if (!c?.width || !c.height) return null;
  const portrait = source !== null && source.height > source.width;
  return portrait ? { width: c.height, height: c.width } : { width: c.width, height: c.height };
}

function shortSide(size: Size): number {
  return Math.min(size.width, size.height);
}

/** The camera's encoding for a preset. The bitrate stays libwebrtc's 720p one from 720p up:
    react-native-webrtc ignores the engine clearing it, so a cap has to be lifted by a number. */
export function cameraSend(preset: QualityPreset, source: Size | null, tools: QualityTools): VideoSendSettings {
  const maxSize = ceilingFor(preset.quality, source, tools);
  const small = maxSize !== null && shortSide(maxSize) < 720;
  return {
    degradationPreference: "maintain-framerate",
    maxFramerate: preset.fps,
    maxSize,
    maxBitrate: small ? tools.cameraBitrate(maxSize.width, maxSize.height, preset.fps) : 2_500_000,
  };
}

/** A share's encoding for a preset: sharp text over smooth motion, as on the desktop. The
    bitrate follows what is sent, so a box bigger than iOS's 960-pixel frames adds nothing. */
export function screenSend(preset: QualityPreset, source: Size | null, tools: QualityTools): VideoSendSettings {
  const maxSize = ceilingFor(preset.quality, source, tools);
  const sides = [maxSize, source].filter((s): s is Size => s !== null).map(shortSide);
  const lines = sides.length ? Math.min(...sides) : 1080;
  return {
    degradationPreference: "maintain-resolution",
    maxFramerate: preset.fps,
    maxSize,
    maxBitrate: tools.screenBitrate(lines, preset.fps),
  };
}
