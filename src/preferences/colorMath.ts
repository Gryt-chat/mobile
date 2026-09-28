import { isHexColor, normalizeHexColor } from "@gryt/theme";

/**
 * HSV, and the two gestures a picker turns into it: a point in a saturation/value
 * square, and an x on a hue strip. Kept clear of React so the maths is testable alone.
 */

export interface Hsv {
  /** Degrees, 0 to 360. 360 and 0 are the same colour. */
  h: number;
  /** 0 to 1. */
  s: number;
  /** 0 to 1. */
  v: number;
}

interface Rgb255 {
  r: number;
  g: number;
  b: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function hexToRgb255(hex: string): Rgb255 {
  const normalized = normalizeHexColor(hex).replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgb255ToHex({ r, g, b }: Rgb255): string {
  const part = (channel: number) =>
    Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** A colour nothing here can parse falls back to black, same as an unset swatch. */
export function hexToHsv(hex: string): Hsv {
  if (!isHexColor(hex)) return { h: 0, s: 0, v: 0 };
  const { r, g, b } = hexToRgb255(hex);
  const [rf, gf, bf] = [r / 255, g / 255, b / 255];
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rf) h = 60 * (((gf - bf) / delta) % 6);
    else if (max === gf) h = 60 * ((bf - rf) / delta + 2);
    else h = 60 * ((rf - gf) / delta + 4);
  }
  if (h < 0) h += 360;

  const v = max;
  const s = max === 0 ? 0 : delta / max;
  return { h, s, v };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;

  let rgb: [number, number, number];
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  return rgb255ToHex({
    r: (rgb[0] + m) * 255,
    g: (rgb[1] + m) * 255,
    b: (rgb[2] + m) * 255,
  });
}

/**
 * The saturation/value square: x is saturation, y is value upside down — the top
 * edge is full brightness, same as every picker that isn't a graphing calculator.
 */
export function svFromPoint(
  x: number,
  y: number,
  width: number,
  height: number,
): { s: number; v: number } {
  const s = width > 0 ? clamp01(x / width) : 0;
  const v = height > 0 ? clamp01(1 - y / height) : 0;
  return { s, v };
}

export function pointFromSv(
  s: number,
  v: number,
  width: number,
  height: number,
): { x: number; y: number } {
  return { x: clamp01(s) * width, y: (1 - clamp01(v)) * height };
}

/** The hue strip: a plain left-to-right ramp, 0 at the left edge. */
export function hueFromX(x: number, width: number): number {
  if (width <= 0) return 0;
  return Math.min(360, Math.max(0, (x / width) * 360));
}

export function xFromHue(hue: number, width: number): number {
  const wrapped = ((hue % 360) + 360) % 360;
  return (wrapped / 360) * width;
}
