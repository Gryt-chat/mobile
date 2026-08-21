import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { avatarSeed, generatedAvatarColour, generatedAvatarSvg } from "./generatedAvatar";

/**
 * The web client's output for the same seeds, generated from its own tree on
 * 2026-08-21 and pinned here.
 *
 * This is the only thing that catches the failure this whole module exists to
 * avoid: the two clients drawing one person as two different people. Nothing
 * else would — both would build, both would render a perfectly good face, and
 * the only symptom is somebody saying "that's not what you look like on my
 * laptop".
 *
 * It also catches a DiceBear upgrade changing the output. If this fails after a
 * bump, the question is not "update the hashes" — it is whether the web client
 * bumped too. They have to move together or not at all.
 */
const WEB = {
  sivert: { sha: "8715791fb4ebc6ac", colour: "#ebdbad" },
  ingy: { sha: "3b9f03f91f71c96e", colour: "#c2adeb" },
  gryt: { sha: "b9e3dbec0a9301b8", colour: "#adebe0" },
} as const;

describe("generatedAvatar", () => {
  it.each(Object.entries(WEB))("draws %s exactly as the web client does", (seed, expected) => {
    const svg = generatedAvatarSvg(seed);
    expect(createHash("sha256").update(svg).digest("hex").slice(0, 16)).toBe(expected.sha);
    expect(generatedAvatarColour(seed)).toBe(expected.colour);
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
