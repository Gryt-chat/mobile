import { describe, expect, it, vi } from "vitest";

import { tourSteps } from "./steps";

describe("tourSteps", () => {
  it("has one entry per id and one per target", () => {
    expect(new Set(tourSteps.map((step) => step.id)).size).toBe(tourSteps.length);
    expect(new Set(tourSteps.map((step) => step.target)).size).toBe(tourSteps.length);
  });

  it("starts on the tab bar and ends on the server switcher", () => {
    expect(tourSteps[0].target).toBe("you-tab");
    expect(tourSteps[tourSteps.length - 1].target).toBe("server-switcher");
  });

  it("switches to the You tab before pointing at something on it", () => {
    const switchTab = vi.fn();
    const profileStep = tourSteps.find((step) => step.target === "profile-card");
    profileStep?.enter?.({ switchTab });
    expect(switchTab).toHaveBeenCalledWith("you");
  });

  it("switches back to the server tab for the last step", () => {
    const switchTab = vi.fn();
    const serverStep = tourSteps[tourSteps.length - 1];
    serverStep.enter?.({ switchTab });
    expect(switchTab).toHaveBeenCalledWith("(server)");
  });

  it("leaves the first and third steps to switch nothing", () => {
    // "you-tab" is in the persistent bar and "account-row" is already on the
    // page the previous step switched to — neither needs its own hop.
    const switchTab = vi.fn();
    tourSteps[0].enter?.({ switchTab });
    tourSteps[2].enter?.({ switchTab });
    expect(switchTab).not.toHaveBeenCalled();
  });
});
