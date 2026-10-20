import { describe, expect, it, vi } from "vitest";

vi.mock("react-native-reanimated", () => ({ default: {}, makeMutable: (v: number) => ({ value: v }), withTiming: (v: number) => v }));
vi.mock("react-native", () => ({ View: "View" }));
vi.mock("../avatar/generatedAvatar", () => ({
  avatarSeed: (s: string) => s.toLowerCase(),
  generatedAvatarColour: (s: string) => (s === "grey" ? "#808080" : "#ff0000"),
  TILE_HUES: [10, 20, 30],
}));

const { hueFromColour, levelFromAmplitude, levelFromDb, speakingHue } = await import("./SpeakingAvatar");

describe("levels", () => {
  it("is the desktop's: linear in dB from -55 to -12", () => {
    expect(levelFromDb(-55)).toBe(0);
    expect(levelFromDb(-12)).toBe(1);
    expect(levelFromDb(-33.5)).toBeCloseTo(0.5);
    expect(levelFromDb(-Infinity)).toBe(0);
    expect(levelFromDb(0)).toBe(1);
  });

  it("reads WebRTC's linear audioLevel through dB", () => {
    expect(levelFromAmplitude(0)).toBe(0);
    expect(levelFromAmplitude(10 ** (-12 / 20))).toBeCloseTo(1);
  });
});

describe("hue", () => {
  it("takes the owl's colour, and grey falls back to the palette", () => {
    expect(hueFromColour("#ff0000")).toBe(0);
    expect(hueFromColour("#00ff00")).toBe(120);
    expect(hueFromColour("#808080")).toBeNull();
    expect(speakingHue("Sivert")).toBe(0);
    expect([10, 20, 30]).toContain(speakingHue("grey"));
  });
});
