import { describe, expect, it } from "vitest";

import { clearFold } from "./clearFold";

const card = { top: 348, left: 16, width: 320, height: 173 };
const target = { x: 10, y: 92, width: 299, height: 244 };

describe("clearFold", () => {
  it("leaves the card alone with no fold", () => {
    expect(clearFold(card, target, null, 12)).toEqual({ top: 348, left: 16 });
  });

  it("moves a card below an upright fold it crosses", () => {
    const fold = { x: 0, y: 470, width: 669, height: 10 };
    expect(clearFold(card, target, fold, 12)).toEqual({ top: 492, left: 16 });
  });

  it("goes above an upright fold when below would cover the target", () => {
    const fold = { x: 0, y: 455, width: 669, height: 40 };
    const low = { x: 10, y: 471, width: 299, height: 148 };
    expect(clearFold({ ...card, top: 286 }, low, fold, 12)).toEqual({ top: 270, left: 16 });
  });

  it("leaves a card clear of an upright fold", () => {
    const fold = { x: 0, y: 600, width: 669, height: 10 };
    expect(clearFold(card, target, fold, 12)).toEqual({ top: 348, left: 16 });
  });

  it("keeps a card in its target's half of a sideways fold", () => {
    const fold = { x: 300, y: 0, width: 10, height: 669 };
    expect(clearFold(card, target, fold, 12).left).toBe(12);
    const right = { x: 700, y: 92, width: 200, height: 100 };
    expect(clearFold(card, right, fold, 12).left).toBe(322);
  });
});
