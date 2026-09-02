import { describe, expect, it } from "vitest";

import { contrast, readableRoleColor } from "./roleColor";

/** The drawer's own surface, both themes, read off @gryt/ui-native's tokens. */
const DARK = "#22262f";
const LIGHT = "#edeff4";

function rgb(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

function ratio(colour: string, background: string): number {
  return contrast(rgb(colour), rgb(background));
}

describe("readableRoleColor", () => {
  it("leaves a colour alone when it already reads", () => {
    // #22c55e is 6.6:1 on the dark drawer. Touching it would be changing the
    // operator's choice for no reason.
    expect(readableRoleColor("#22c55e", DARK)).toBe("#22c55e");
  });

  it("rescues a colour that does not", () => {
    // The case this exists for: navy on a dark drawer is 1.5:1, invisible.
    expect(ratio("#1e3a8a", DARK)).toBeLessThan(2);

    const fixed = readableRoleColor("#1e3a8a", DARK)!;
    expect(ratio(fixed, DARK)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the hue while it does it", () => {
    // Still blue: blue is the largest channel before and after. A fix that
    // returned grey would pass the contrast check and lose the role.
    const [r, g, b] = rgb(readableRoleColor("#1e3a8a", DARK)!);
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });

  it("darkens instead on a light background", () => {
    // #fde047 is 1.1:1 on the light drawer — the mirror image of the navy case.
    const fixed = readableRoleColor("#fde047", LIGHT)!;
    expect(ratio(fixed, LIGHT)).toBeGreaterThanOrEqual(4.5);
    expect(rgb(fixed)[0]).toBeLessThan(rgb("#fde047")[0]);
  });

  it("clears 4.5:1 for every hue, on both surfaces", () => {
    // The operator can pick anything. Sweeping the wheel at full saturation is
    // the closest thing to "anything" that a test can assert.
    for (let hue = 0; hue < 360; hue += 15) {
      for (const background of [DARK, LIGHT]) {
        const colour = hslHex(hue, 1, 0.5);
        const fixed = readableRoleColor(colour, background)!;
        expect(
          ratio(fixed, background),
          `hue ${hue} on ${background} (from ${colour} to ${fixed})`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("says nothing when the role has no colour", () => {
    expect(readableRoleColor(null, DARK)).toBeNull();
    expect(readableRoleColor(undefined, DARK)).toBeNull();
    expect(readableRoleColor("", DARK)).toBeNull();
  });

  it("says nothing when the colour is not one", () => {
    // A server is free to put anything in that column.
    expect(readableRoleColor("rebeccapurple", DARK)).toBeNull();
    expect(readableRoleColor("#12345", DARK)).toBeNull();
  });

  it("takes the short form", () => {
    expect(readableRoleColor("#fff", DARK)).toBe("#ffffff");
  });
});

/** Only for the sweep above: a saturated colour at a given hue. */
function hslHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}
