/**
 * A role's colour, pulled into a band the surface behind it can carry.
 *
 * Role colours are chosen by whoever runs the server, against no background in
 * particular, so some of them are unreadable somewhere: `#1e3a8a` on a dark
 * drawer is 1.5:1. Refusing to draw those throws away the operator's choice;
 * drawing them as-is throws away the name.
 *
 * The desktop client solves this in CSS — `oklch(from … clamp(…) …)` — and
 * React Native has no relative colour syntax, so the same idea is arithmetic
 * here. It is the better half of the deal: this measures against the actual
 * background it was handed rather than against a band fitted to one theme, so
 * a custom accent or a future surface colour cannot quietly break it.
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
 * Move a colour towards white or black, whichever the background is not.
 *
 * Mixing towards one end keeps the hue — a navy lightened this way is a paler
 * navy rather than a grey — which is the property that matters. It is not
 * perceptually even the way OKLCH lightness is, but the step is small and the
 * loop stops as soon as it is readable, so the result is the nearest legible
 * version of what the operator picked rather than a normalised one.
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
 * The colour to draw a role's name in, or null when there is nothing to draw.
 *
 * Null rather than a fallback: a role with no colour should use whatever the
 * caller would have used anyway, and inventing a hue here would make every
 * uncoloured role look deliberate.
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

  // Nothing in between worked, which happens for a colour whose hue is very
  // close to the background's own. The end of the ramp is readable by
  // construction.
  return toHex(target);
}
