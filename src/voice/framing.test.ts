import { describe, expect, it } from "vitest";

import { coverRect } from "./framing";

const box = { width: 100, height: 100 };
const wide = { width: 1280, height: 720 };

describe("coverRect", () => {
  it("centres a wide video in a square tile when framing is centred", () => {
    const r = coverRect(box, wide, { x: 0.5, y: 0.5 });
    expect(r.height).toBe(100);
    expect(r.width).toBeCloseTo(177.78, 1);
    expect(r.left).toBeCloseTo(-38.89, 1);
    expect(r.top).toBe(0);
  });

  it("shows the left edge at x 0 and the right edge at x 1, as object-position does", () => {
    expect(coverRect(box, wide, { x: 0, y: 0.5 }).left).toBeCloseTo(0);
    const right = coverRect(box, wide, { x: 1, y: 0.5 });
    expect(right.left + right.width).toBeCloseTo(100);
  });

  it("moves along the axis that overflows only", () => {
    const tall = coverRect({ width: 100, height: 300 }, wide, { x: 0.2, y: 0.9 });
    expect(tall.top).toBe(0);
    expect(tall.left).toBeLessThan(0);
  });
});
