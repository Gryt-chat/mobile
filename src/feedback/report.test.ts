import { describe, expect, it } from "vitest";

import { buildReport, describeAttached, MESSAGE_MAX, TITLE_MAX } from "./report";

describe("buildReport", () => {
  it("sends the two required fields and nothing it does not know", () => {
    expect(buildReport("bug", { message: "it broke" })).toEqual({
      type: "bug",
      message: "it broke",
      title: undefined,
      contact: undefined,
      app: undefined,
      device: undefined,
      runtime: undefined,
      context: undefined,
    });
  });

  /* An empty `device` object claims "this app does not collect device
   * information", which is a different and wronger thing than leaving it off. */
  it("leaves a section off entirely rather than sending an empty one", () => {
    const report = buildReport("bug", { message: "x" }, { version: "1.0.0" });

    expect(report.app).toEqual({ version: "1.0.0" });
    expect(report.device).toBeUndefined();
    expect(report.runtime).toBeUndefined();
    expect(report.context).toBeUndefined();
  });

  it("drops a diagnostic it could not work out rather than guessing", () => {
    const report = buildReport(
      "feedback",
      { message: "x" },
      { platform: "ios", osVersion: null, isEmulator: null },
    );

    expect(report.device).toEqual({ platform: "ios" });
  });

  it("keeps false, which is a value and not a missing one", () => {
    // `isEmulator: false` and `connected: false` are both worth knowing, and
    // both are falsy — the easy bug here is treating them as absent.
    const report = buildReport(
      "bug",
      { message: "x" },
      { isEmulator: false, connected: false },
    );

    expect(report.device).toEqual({ isEmulator: false });
    expect(report.context).toEqual({ connected: false });
  });

  it("trims, and treats whitespace as nothing", () => {
    const report = buildReport("bug", { message: "  hello  ", title: "   " });

    expect(report.message).toBe("hello");
    expect(report.title).toBeUndefined();
  });

  it("caps rather than rejects", () => {
    const report = buildReport("bug", {
      message: "m".repeat(MESSAGE_MAX + 500),
      title: "t".repeat(TITLE_MAX + 50),
    });

    expect(report.message).toHaveLength(MESSAGE_MAX);
    expect(report.title).toHaveLength(TITLE_MAX);
  });

  it("keeps a numeric uptime as a number, and drops a nonsense one", () => {
    expect(
      buildReport("bug", { message: "x" }, { sessionUptimeSec: 0 }).context,
    ).toEqual({ sessionUptimeSec: 0 });
    expect(
      buildReport("bug", { message: "x" }, { sessionUptimeSec: NaN }).context,
    ).toBeUndefined();
  });

  it("numbers become strings, because Platform.Version is a number on Android", () => {
    const report = buildReport("bug", { message: "x" }, { osVersion: 34 });

    expect(report.device).toEqual({ osVersion: "34" });
  });
});

describe("describeAttached", () => {
  /* This is what somebody is shown before they send. It is built from the
   * report rather than from the inputs so it cannot claim something different
   * from what actually goes. */
  it("describes only what is in the report", () => {
    const report = buildReport(
      "bug",
      { message: "x" },
      {
        version: "1.0.0",
        build: "7",
        platform: "ios",
        osVersion: "26.5",
        route: "/channel/abc",
      },
    );

    expect(describeAttached(report)).toEqual([
      { label: "Gryt", value: "1.0.0 (7)" },
      { label: "Device", value: "iOS 26.5" },
      { label: "Where you were", value: "/channel/abc" },
    ]);
  });

  it("reads a duration rather than printing a field", () => {
    const shown = (seconds: number) =>
      describeAttached(buildReport("bug", { message: "x" }, { sessionUptimeSec: seconds }))
        .find((l) => l.label === "Running for")?.value;

    expect(shown(12)).toBe("12 sec");
    expect(shown(600)).toBe("10 min");
    expect(shown(7200)).toBe("2 h");
  });

  it("says nothing when nothing is attached", () => {
    expect(describeAttached(buildReport("feedback", { message: "x" }))).toEqual([]);
  });

  /* The wire keeps the service's lowercase enum; only the list a person reads
   * is prettified, because "ios 26.5" reads as a typo. */
  it("prettifies the platform for reading without changing the report", () => {
    const report = buildReport("bug", { message: "x" }, { platform: "ios", osVersion: "26.5" });

    expect(report.device?.platform).toBe("ios");
    expect(describeAttached(report)).toContainEqual({ label: "Device", value: "iOS 26.5" });
  });

  it("only mentions the simulator when it is one", () => {
    const real = buildReport("bug", { message: "x" }, { isEmulator: false });
    const sim = buildReport("bug", { message: "x" }, { isEmulator: true });

    expect(describeAttached(real).map((l) => l.label)).not.toContain("Simulator");
    expect(describeAttached(sim).map((l) => l.label)).toContain("Simulator");
  });
});
