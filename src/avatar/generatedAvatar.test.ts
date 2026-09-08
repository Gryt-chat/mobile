import { createHash } from "node:crypto";
import {
  avatarSeed as owlAvatarSeed,
  owlAvatarColour,
  owlAvatarSvg,
} from "@gryt/owl";
import { describe, expect, it } from "vitest";

import {
  avatarSeed,
  generatedAvatarColour,
  generatedAvatarSvg,
  generatedServerIconSvg,
} from "./generatedAvatar";

const SEEDS = ["sivert", "ingy", "gryt", "sivert h"];

/**
 * Both apps call `@gryt/owl`, so what is left here is the seam. Two apps on different
 * versions of that package is the one thing no unit test can see.
 */
describe("generatedAvatar", () => {
  it.each(SEEDS)("hands %s's owl through exactly as the generator drew it", (seed) => {
    expect(generatedAvatarSvg(seed)).toBe(owlAvatarSvg(seed));
  });

  it("returns the same markup on a second call, from the cache", () => {
    expect(generatedAvatarSvg("sivert")).toBe(generatedAvatarSvg("sivert"));
  });

  it.each(SEEDS)("reports the colour %s's owl was drawn on", (seed) => {
    expect(generatedAvatarColour(seed)).toBe(owlAvatarColour(seed));
    expect(generatedAvatarColour(seed)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("re-exports the package's seed rule rather than writing it out again", () => {
    expect(avatarSeed).toBe(owlAvatarSeed);
  });

  it("normalises case and surrounding whitespace to one person", () => {
    expect(avatarSeed("  Sivert ")).toBe("sivert");
    expect(avatarSeed("SIVERT")).toBe(avatarSeed("sivert"));
  });

  it("has no seed for a name that is empty or only whitespace", () => {
    expect(avatarSeed("   ")).toBeUndefined();
    expect(avatarSeed("")).toBeUndefined();
    expect(avatarSeed(null)).toBeUndefined();
    expect(avatarSeed(undefined)).toBeUndefined();
  });

  it("keeps everything that is not case or edge whitespace", () => {
    expect(avatarSeed("Sivert H")).toBe("sivert h");
    expect(generatedAvatarSvg("sivert h")).not.toBe(generatedAvatarSvg("sivert"));
  });
});

/**
 * The web client's Planets output for the same seeds, generated on 2026-08-21. Still a
 * copied constant: server icons are the one thing the two apps do not share a package
 * for. If one fails after a bump, the question is whether the desktop bumped too.
 */
const WEB_SERVERS = {
  "Guest Test Server": "d2e41b1c4d920544",
  Gryt: "ab6f29e06340093d",
  "my server": "20f4dd75ac737d29",
} as const;

describe("generatedServerIcon", () => {
  it.each(Object.entries(WEB_SERVERS))("draws %s exactly as the web client does", (seed, sha) => {
    const svg = generatedServerIconSvg(seed);
    expect(createHash("sha256").update(svg).digest("hex").slice(0, 16)).toBe(sha);
  });

  it("is seeded on the name, so a rename redraws it", () => {
    expect(generatedServerIconSvg("Gryt")).not.toBe(generatedServerIconSvg("Gryt "));
  });

  it("is not a person — a server and a person with one name draw differently", () => {
    expect(generatedServerIconSvg("Gryt")).not.toBe(generatedAvatarSvg("gryt"));
  });
});
