import { cloneGrytTheme, grytPresets, grytTheme } from "@gryt/theme";
import { describe, expect, it } from "vitest";

import {
  customThemeId,
  isCustomThemeId,
  presetIdFromThemeId,
  presetThemeId,
  resolveActiveTheme,
  setGrytThemeHue,
  setGrytThemeNeutral,
  themeName,
} from "./appearanceTheme";

describe("resolveActiveTheme", () => {
  it("is null for Gryt's own", () => {
    expect(resolveActiveTheme(null, [])).toBeNull();
  });

  it("finds a shipped preset by id", () => {
    const preset = grytPresets.find((p) => p.id !== "gryt")!;
    expect(resolveActiveTheme(presetThemeId(preset.id), [])).toBe(preset.theme);
  });

  it("finds a custom theme by id", () => {
    const saved = { id: customThemeId(), name: "Mine", theme: grytPresets[0].theme };
    expect(resolveActiveTheme(saved.id, [saved])).toBe(saved.theme);
  });

  it("falls back to null for an id nothing matches", () => {
    expect(resolveActiveTheme(presetThemeId("does-not-exist"), [])).toBeNull();
    expect(resolveActiveTheme("custom:gone", [])).toBeNull();
  });
});

describe("customThemeId", () => {
  it("never repeats across two calls", () => {
    expect(customThemeId()).not.toBe(customThemeId());
  });
});

describe("themeName", () => {
  it("is Gryt for the library's own", () => {
    expect(themeName(null, [])).toBe("Gryt");
  });

  it("names a shipped preset", () => {
    const preset = grytPresets.find((p) => p.id !== "gryt")!;
    expect(themeName(presetThemeId(preset.id), [])).toBe(preset.name);
  });

  it("names a custom theme", () => {
    const saved = { id: customThemeId(), name: "Mine", theme: grytPresets[0].theme };
    expect(themeName(saved.id, [saved])).toBe("Mine");
  });

  it("falls back to Gryt for an id nothing matches", () => {
    expect(themeName("custom:gone", [])).toBe("Gryt");
  });
});

describe("presetIdFromThemeId", () => {
  it("is null for Gryt's own and for a custom theme", () => {
    expect(presetIdFromThemeId(null)).toBeNull();
    expect(presetIdFromThemeId(customThemeId())).toBeNull();
  });

  it("bares the preset id inside a preset theme id", () => {
    expect(presetIdFromThemeId(presetThemeId("nord"))).toBe("nord");
  });
});

describe("isCustomThemeId", () => {
  it("is true only for a theme saved on this phone", () => {
    expect(isCustomThemeId(customThemeId())).toBe(true);
    expect(isCustomThemeId(presetThemeId("nord"))).toBe(false);
    expect(isCustomThemeId(null)).toBe(false);
  });
});

describe("setGrytThemeHue", () => {
  it("writes into the shared hues when light has none of its own", () => {
    const base = cloneGrytTheme(grytTheme);
    base.lightHue = null;
    const next = setGrytThemeHue(base, "light", "accent", "#123456");
    expect(next.hue.accent).toBe("#123456");
    expect(next.lightHue).toBeNull();
  });

  it("writes into light's own hues rather than dark's when it has them", () => {
    const base = cloneGrytTheme(grytTheme);
    const next = setGrytThemeHue(base, "light", "accent", "#123456");
    expect(next.lightHue?.accent).toBe("#123456");
    expect(next.hue.accent).toBe(base.hue.accent);
  });

  it("leaves the rest of the hues untouched", () => {
    const base = cloneGrytTheme(grytTheme);
    base.lightHue = null;
    const next = setGrytThemeHue(base, "dark", "accent", "#123456");
    expect(next.hue.secondary).toBe(base.hue.secondary);
  });
});

describe("setGrytThemeNeutral", () => {
  it("writes only into the half being edited", () => {
    const base = cloneGrytTheme(grytTheme);
    const next = setGrytThemeNeutral(base, "dark", "bg", "#111111");
    expect(next.dark.bg).toBe("#111111");
    expect(next.light.bg).toBe(base.light.bg);
  });
});
