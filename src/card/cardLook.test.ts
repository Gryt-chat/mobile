import { describe, expect, it } from "vitest";
import { DEFAULT_CARD_STYLE, normalizeCardStyle } from "@gryt/ui/card-core";

import { cardLook, parseGradient, rnColour, svgOf } from "./cardLook";

const opts = { appearance: "dark" as const, seed: 7, surface: "#1c1b22" };

describe("card colours as React Native takes them (GRYT-1630)", () => {
  it("turns oklch() into hex, with alpha when there is one", () => {
    expect(rnColour("oklch(100% 0 0)")).toBe("#ffffff");
    expect(rnColour("oklch(0% 0 0 / 0.5)")).toBe("#00000080");
    expect(rnColour("#abcdef")).toBe("#abcdef");
  });

  it("reads both gradient shapes cardVars writes", () => {
    expect(parseGradient("linear-gradient(160deg, #111111, #222222)")).toEqual({ from: "#111111", to: "#222222", angle: 160 });
    expect(parseGradient("linear-gradient(#333333, #333333)")).toEqual({ from: "#333333", to: "#333333", angle: 180 });
    expect(parseGradient("linear-gradient(90deg, oklch(100% 0 0), oklch(0% 0 0))")).toEqual({ from: "#ffffff", to: "#000000", angle: 90 });
  });

  it("unwraps the pattern's data URL back to markup", () => {
    const svg = "<svg xmlns='http://www.w3.org/2000/svg'><g/></svg>";
    expect(svgOf(`url("data:image/svg+xml,${encodeURIComponent(svg)}")`)).toBe(svg);
    expect(svgOf(undefined)).toBeNull();
  });

  it("draws a card nobody styled whole, in the owl's colours", () => {
    const look = cardLook(DEFAULT_CARD_STYLE, "#7c5cff", opts);
    expect(look.full).toBe(true);
    expect(look.banner.from).toBe("#7c5cff");
    expect(look.card?.angle).toBe(160);
  });

  it("colours only the banner when asked, with the owl's hue on the band", () => {
    const look = cardLook(normalizeCardStyle({ ...DEFAULT_CARD_STYLE, colours: "banner" }), "#7c5cff", opts);
    expect(look.full).toBe(false);
    expect(look.banner).toEqual({ from: "#7c5cff", to: "#7c5cff", angle: 180 });
    expect(look.band?.colour).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("gives a card coloured whole its own fill and ink, and a dots pattern as SVG", () => {
    const style = normalizeCardStyle({ ...DEFAULT_CARD_STYLE, colours: "card", fill: "solid", c1: "#2a6f4f", pattern: "dots" });
    const look = cardLook(style, "#7c5cff", opts);
    expect(look.full).toBe(true);
    expect(look.card?.from).toMatch(/^#[0-9a-f]{6}$/);
    expect(look.text).toMatch(/^#[0-9a-f]{6}$/);
    expect(look.pattern).toContain("<pattern");
  });
});
