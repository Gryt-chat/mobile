/**
 * A role's colour, pulled into a band the surface behind it can carry. The desktop
 * does this in CSS; React Native has no relative colour syntax, so it is arithmetic —
 * which measures against the background it was handed rather than a fitted band.
 */

/** WCAG AA for body text. The names are 15px. */
const TARGET = 4.5;

function parseHex(hex: string): [number, number, number] | null {
  const value = hex.trim().replace(/^#/, "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    "#" +
    [r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")
  );
}

function channelLuminance(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function luminance(rgb: [number, number, number]): number {
  return (
    0.2126 * channelLuminance(rgb[0]) +
    0.7152 * channelLuminance(rgb[1]) +
    0.0722 * channelLuminance(rgb[2])
  );
}

/** The WCAG ratio between two colours, either order. */
export function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Move a colour towards white or black, whichever the background is not. Mixing
 * towards one end keeps the hue, which is the property that matters.
 */
function mix(
  colour: [number, number, number],
  towards: [number, number, number],
  amount: number,
): [number, number, number] {
  return [
    colour[0] + (towards[0] - colour[0]) * amount,
    colour[1] + (towards[1] - colour[1]) * amount,
    colour[2] + (towards[2] - colour[2]) * amount,
  ];
}

/**
 * The colour to draw a role's name in, or null when there is nothing to draw. Null
 * rather than a fallback: inventing a hue makes every uncoloured role look deliberate.
 */
export function readableRoleColor(
  role: string | null | undefined,
  background: string,
): string | null {
  const colour = role ? parseHex(role) : null;
  const behind = parseHex(background);
  if (!colour || !behind) return null;

  if (contrast(colour, behind) >= TARGET) return toHex(colour);

  // Towards whichever end the background is furthest from. A dark drawer
  // lightens the colour, a light one darkens it.
  const target: [number, number, number] =
    luminance(behind) > 0.5 ? [0, 0, 0] : [255, 255, 255];

  for (let amount = 0.05; amount <= 1; amount += 0.05) {
    const candidate = mix(colour, target, amount);
    if (contrast(candidate, behind) >= TARGET) return toHex(candidate);
  }

  // Nothing in between worked, which happens for a hue very close to the
  // background's own. The end of the ramp is readable by construction.
  return toHex(target);
}
