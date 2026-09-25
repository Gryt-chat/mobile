import { describe, expect, it } from "vitest";
import { cameraBitrate, QUALITY_CONSTRAINTS, screenBitrate } from "@gryt/voice";

import {
  CAMERA_PRESETS,
  cameraSend,
  ceilingFor,
  DEFAULT_CAMERA_PRESET,
  presetKey,
  presetLabel,
  SCREEN_PRESETS,
  screenSend,
} from "./streamQuality";

const tools = { QUALITY_CONSTRAINTS, cameraBitrate, screenBitrate };
const camera720 = { width: 1280, height: 720 };
const phoneScreen = { width: 1206, height: 2622 };

describe("presets", () => {
  it("are the desktop's, in its order", () => {
    expect(CAMERA_PRESETS.map(presetKey)).toEqual(["native@30", "720p@30", "360p@15"]);
    expect(SCREEN_PRESETS.map(presetKey)).toEqual(["native@30", "1080p@60", "720p@30"]);
    expect(presetLabel(SCREEN_PRESETS[1])).toBe("1080p · 60 fps");
    expect(presetLabel(CAMERA_PRESETS[0])).toBe("Native · 30 fps");
  });
});

describe("ceilingFor", () => {
  it("has no box for native", () => {
    expect(ceilingFor("native", phoneScreen, tools)).toBeNull();
  });

  it("turns the box upright for a portrait screen", () => {
    expect(ceilingFor("1080p", phoneScreen, tools)).toEqual({ width: 1080, height: 1920 });
    expect(ceilingFor("720p", camera720, tools)).toEqual({ width: 1280, height: 720 });
  });
});

describe("cameraSend", () => {
  it("keeps what the phone always sent for the default", () => {
    expect(cameraSend(DEFAULT_CAMERA_PRESET, camera720, tools)).toEqual({
      degradationPreference: "maintain-framerate",
      maxFramerate: 30,
      maxSize: { width: 1280, height: 720 },
      maxBitrate: 2_500_000,
    });
  });

  it("caps size, rate and bitrate for the data saver", () => {
    const low = cameraSend(CAMERA_PRESETS[2], camera720, tools);
    expect(low.maxSize).toEqual({ width: 640, height: 360 });
    expect(low.maxFramerate).toBe(15);
    expect(low.maxBitrate).toBe(cameraBitrate(640, 360, 15));
    expect(low.maxBitrate).toBeLessThan(2_500_000);
  });

  it("gives native no ceiling", () => {
    expect(cameraSend(CAMERA_PRESETS[0], camera720, tools).maxSize).toBeNull();
  });
});

describe("screenSend", () => {
  it("sizes the bitrate by the short side of a portrait screen", () => {
    expect(screenSend(SCREEN_PRESETS[0], phoneScreen, tools)).toEqual({
      degradationPreference: "maintain-resolution",
      maxFramerate: 30,
      maxSize: null,
      maxBitrate: screenBitrate(1206, 30),
    });
  });

  it("caps at the preset's box and rate", () => {
    const smooth = screenSend(SCREEN_PRESETS[1], phoneScreen, tools);
    expect(smooth.maxSize).toEqual({ width: 1080, height: 1920 });
    expect(smooth.maxFramerate).toBe(60);
    expect(smooth.maxBitrate).toBe(screenBitrate(1080, 60));
    expect(screenSend(SCREEN_PRESETS[2], phoneScreen, tools).maxBitrate).toBe(screenBitrate(720, 30));
  });

  it("pays for no more lines than iOS's broadcast sends", () => {
    const broadcast = { width: 442, height: 960 };
    expect(screenSend(SCREEN_PRESETS[1], broadcast, tools).maxBitrate).toBe(screenBitrate(442, 60));
  });
});
