import { describe, expect, it } from "vitest";

import {
  hexToHsv,
  hsvToHex,
  hueFromX,
  pointFromSv,
  svFromPoint,
  xFromHue,
} from "./colorMath";

describe("hexToHsv", () => {
  it("reads the six pure corners of the wheel", () => {
    expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv("#00ff00")).toEqual({ h: 120, s: 1, v: 1 });
    expect(hexToHsv("#0000ff")).toEqual({ h: 240, s: 1, v: 1 });
  });

  it("has no saturation for grey, including white and black", () => {
    expect(hexToHsv("#ffffff")).toMatchObject({ s: 0, v: 1 });
    expect(hexToHsv("#000000")).toMatchObject({ s: 0, v: 0 });
    expect(hexToHsv("#808080")).toMatchObject({ s: 0 });
  });

  it("falls back to black for a string that is not a colour", () => {
    expect(hexToHsv("not a colour")).toEqual({ h: 0, s: 0, v: 0 });
  });
});

describe("hsvToHex", () => {
  it("is the inverse of hexToHsv for byte-aligned colours", () => {
    for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#3a7bd5", "#1a2b3c", "#ffffff", "#000000"]) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it("treats hue 360 the same as hue 0", () => {
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe(hsvToHex({ h: 0, s: 1, v: 1 }));
  });
});

describe("svFromPoint / pointFromSv", () => {
  it("reads the four corners of the square", () => {
    expect(svFromPoint(0, 0, 100, 100)).toEqual({ s: 0, v: 1 });
    expect(svFromPoint(100, 0, 100, 100)).toEqual({ s: 1, v: 1 });
    expect(svFromPoint(0, 100, 100, 100)).toEqual({ s: 0, v: 0 });
    expect(svFromPoint(100, 100, 100, 100)).toEqual({ s: 1, v: 0 });
  });

  it("clamps a finger that has gone past the edge", () => {
    expect(svFromPoint(-20, -20, 100, 100)).toEqual({ s: 0, v: 1 });
    expect(svFromPoint(200, 200, 100, 100)).toEqual({ s: 1, v: 0 });
  });

  it("never divides by a layout that has not measured yet", () => {
    expect(svFromPoint(50, 50, 0, 0)).toEqual({ s: 0, v: 0 });
  });

  it("is the inverse of pointFromSv", () => {
    expect(pointFromSv(0.5, 0.5, 200, 120)).toEqual({ x: 100, y: 60 });
    expect(svFromPoint(100, 60, 200, 120)).toEqual({ s: 0.5, v: 0.5 });
  });
});

describe("hueFromX / xFromHue", () => {
  it("reads 0 at the left edge and 360 at the right", () => {
    expect(hueFromX(0, 300)).toBe(0);
    expect(hueFromX(300, 300)).toBe(360);
  });

  it("clamps a finger that has gone past either edge", () => {
    expect(hueFromX(-50, 300)).toBe(0);
    expect(hueFromX(400, 300)).toBe(360);
  });

  it("never divides by a layout that has not measured yet", () => {
    expect(hueFromX(50, 0)).toBe(0);
  });

  it("is the inverse of xFromHue", () => {
    expect(xFromHue(180, 300)).toBe(150);
    expect(hueFromX(150, 300)).toBe(180);
  });

  it("wraps a hue outside 0..360 to the same spot on the strip", () => {
    expect(xFromHue(-30, 300)).toBe(xFromHue(330, 300));
    expect(xFromHue(390, 300)).toBe(xFromHue(30, 300));
  });
});
