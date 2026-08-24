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
 * What this file used to do, and why it did not work.
 *
 * It pinned the web client's SHA for three seeds as a hardcoded constant,
 * generated from that tree by hand on 2026-08-21. The idea was to catch the two
 * clients drawing one person as two different people. It could not: the
 * constant was a copy, so it went on agreeing with itself after the desktop
 * moved to owls and this app was still drawing DiceBear Moods. Both built, both
 * rendered a perfectly good face, and the test was green through all of it.
 *
 * Both apps now call `@gryt/owl`, so byte parity is not something a test here
 * has to establish — it is how the code is arranged. `@gryt/owl` pins its own
 * three seeds against their exact output, which is where a change to the drawing
 * gets caught, once, for everybody.
 *
 * What is left for this file is the seam: that this module hands the generator's
 * output through untouched, and does not quietly re-derive the seed rule.
 * Anything done to the string here is something the desktop does not do.
 *
 * The one thing still not covered by anything is the two apps sitting on
 * different versions of `@gryt/owl`. No unit test on either side can see that —
 * each would test against its own copy and pass.
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
 * The web client's Planets output for the same seeds, generated from its tree on
 * 2026-08-21.
 *
 * Still a copied constant, and still worth having, because server icons are the
 * one thing the two apps do *not* share a package for. Each installs
 * `@dicebear/core` and `@dicebear/styles` on its own, so the two can land on
 * different versions and draw different planets. That is exactly what this
 * catches, and it is the failure the owl half no longer has.
 *
 * If one of these fails after a DiceBear bump, the question is not what to
 * update the hash to. It is whether the desktop bumped too. They move together
 * or not at all.
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
