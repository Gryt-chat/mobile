import { describe, expect, it } from "vitest";

import { MEET_GAP, MEET_PADDING, meetLayout } from "./meetLayout";

/**
 * The layout is arithmetic, so it is checked as arithmetic — and why
 * `meetLayout.ts` has no renderer in it. The two worst layout bugs here were
 * both sums, and neither would have survived a test asserting where things land.
 */

/** A phone: tall and narrow. */
const PHONE = { width: 402, height: 700 };
/** Roughly the viewport GRYT-64 measured Meet at. */
const SQUARISH = { width: 500, height: 757 };

describe("meetLayout", () => {
  it("returns nothing before layout has happened", () => {
    expect(meetLayout(4, 0, 0).tiles).toHaveLength(0);
    expect(meetLayout(0, 402, 700).tiles).toHaveLength(0);
  });

  it("gives one person the whole area inside the padding", () => {
    const { tiles } = meetLayout(1, PHONE.width, PHONE.height);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toEqual({
      x: MEET_PADDING,
      y: MEET_PADDING,
      width: PHONE.width - MEET_PADDING * 2,
      height: PHONE.height - MEET_PADDING * 2,
    });
  });

  it("never lets a tile cross the container's padding", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { tiles } = meetLayout(n, PHONE.width, PHONE.height);
      for (const t of tiles) {
        expect(t.x).toBeGreaterThanOrEqual(MEET_PADDING - 0.01);
        expect(t.y).toBeGreaterThanOrEqual(MEET_PADDING - 0.01);
        expect(t.x + t.width).toBeLessThanOrEqual(PHONE.width - MEET_PADDING + 0.01);
        expect(t.y + t.height).toBeLessThanOrEqual(PHONE.height - MEET_PADDING + 0.01);
      }
    }
  });

  it("keeps the gap between neighbours in a row", () => {
    const { tiles } = meetLayout(4, SQUARISH.width, SQUARISH.height);
    const [a, b] = tiles;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    // Same row, so the second starts a gap after the first ends.
    expect(b!.y).toBe(a!.y);
    expect(b!.x - (a!.x + a!.width)).toBeCloseTo(MEET_GAP, 5);
  });

  /**
   * The behaviour most likely to be broken by someone "fixing" it, because the
   * desktop client does the opposite — it scores candidates against a fixed
   * 4/3. Four people stack in one column on a tall narrow phone and form a 2x2
   * on a squarer viewport, from the same optimiser and with no special-casing
   * by count. GRYT-64 confirmed both against a live Meet session.
   */
  it("picks columns by area, not by a target aspect ratio", () => {
    expect(meetLayout(4, 402, 1200).columns).toBe(1);
    expect(meetLayout(4, SQUARISH.width, SQUARISH.height).columns).toBe(2);
  });

  it("gives every participant exactly one tile", () => {
    for (const n of [1, 2, 3, 5, 6, 7, 8]) {
      expect(meetLayout(n, PHONE.width, PHONE.height).tiles).toHaveLength(n);
    }
  });

  /**
   * Uneven counts put the wider tiles in the *first* row. Three in two columns
   * is one full-width then two half-width, not two-then-one — measured from
   * Meet, and the opposite of what filling left-to-right gives you.
   */
  it("spans the first row when the count does not divide evenly", () => {
    const { columns, tiles } = meetLayout(3, SQUARISH.width, SQUARISH.height);
    if (columns !== 2) return; // only meaningful in the two-column case
    expect(tiles[0]!.width).toBeGreaterThan(tiles[1]!.width);
    expect(tiles[1]!.y).toBeGreaterThan(tiles[0]!.y);
  });

  it("never returns a tile with no area", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 12]) {
      for (const t of meetLayout(n, PHONE.width, PHONE.height).tiles) {
        expect(t.width).toBeGreaterThan(0);
        expect(t.height).toBeGreaterThan(0);
      }
    }
  });
});

describe("screen shares", () => {
  it("pins a share full width across the top, people below", () => {
    const { shares, tiles } = meetLayout(2, PHONE.width, PHONE.height, 1);
    expect(shares).toHaveLength(1);
    expect(shares[0]!.width).toBe(PHONE.width - MEET_PADDING * 2);
    expect(shares[0]!.y).toBe(MEET_PADDING);
    // Everyone starts below the share, never beside it.
    for (const t of tiles) {
      expect(t.y).toBeGreaterThanOrEqual(shares[0]!.y + shares[0]!.height);
    }
  });

  it("gives a share the whole area when nobody else is there", () => {
    const { shares, tiles } = meetLayout(0, PHONE.width, PHONE.height, 1);
    expect(tiles).toHaveLength(0);
    expect(shares[0]!.height).toBeCloseTo(PHONE.height - MEET_PADDING * 2, 5);
  });

  it("keeps everything inside the padding with a share present", () => {
    for (const n of [1, 2, 3, 4]) {
      const { shares, tiles } = meetLayout(n, PHONE.width, PHONE.height, 1);
      for (const box of [...shares, ...tiles]) {
        expect(box.x).toBeGreaterThanOrEqual(MEET_PADDING - 0.01);
        expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height - MEET_PADDING + 0.01);
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
      }
    }
  });

  it("stacks two shares rather than putting them side by side", () => {
    const { shares } = meetLayout(2, PHONE.width, PHONE.height, 2);
    expect(shares).toHaveLength(2);
    expect(shares[1]!.x).toBe(shares[0]!.x);
    expect(shares[1]!.y).toBeGreaterThan(shares[0]!.y);
  });
});
