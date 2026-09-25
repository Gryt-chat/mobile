import { describe, expect, it } from "vitest";
import type { NativeTheme } from "@gryt/ui-native";

import { callControlColors, hearingState, microphoneState } from "./callControlState";

const ramp = (name: string) => Array.from({ length: 12 }, (_, i) => `${name}-${i + 1}`);
const theme = {
  color: { surfaceRaised: "raised", surfaceHover: "hover", text: "text" },
  scales: { danger: ramp("danger"), success: ramp("success") },
} as unknown as NativeTheme;

describe("call control state", () => {
  it("puts an admin's mute over your own", () => {
    expect(microphoneState(false, false)).toBe("idle");
    expect(microphoneState(true, false)).toBe("off");
    expect(microphoneState(false, true)).toBe("blocked");
    expect(microphoneState(true, true)).toBe("blocked");
    expect(hearingState(true, false)).toBe("off");
    expect(hearingState(false, true)).toBe("blocked");
  });

  it("uses the web's steps", () => {
    expect(callControlColors(theme, "off")).toMatchObject({ background: "danger-4", tint: "danger-11", pressed: "danger-5" });
    expect(callControlColors(theme, "live")).toMatchObject({ background: "success-4", tint: "success-11" });
    expect(callControlColors(theme, "blocked")).toMatchObject({ tint: "danger-11", opacity: 0.6 });
    expect(callControlColors(theme, "idle")).toMatchObject({ background: "raised", tint: "text" });
  });
});
