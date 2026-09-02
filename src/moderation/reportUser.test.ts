import { describe, expect, it } from "vitest";

import { buildReportRequest, canSendReport, REPORT_REASON_MAX } from "./reportUser";

describe("canSendReport", () => {
  it("refuses an empty reason", () => {
    expect(canSendReport("")).toBe(false);
  });

  /*
   * Whitespace is what a stray tap on the field leaves behind, and the server
   * trims before it checks — so a button enabled on " " sends a report the
   * server then refuses, and the person who pressed it is told nothing useful.
   */
  it("refuses whitespace", () => {
    for (const reason of [" ", "   ", "\n", "\t\n "]) {
      expect(canSendReport(reason)).toBe(false);
    }
  });

  it("accepts a reason with something in it", () => {
    expect(canSendReport("Followed me between channels")).toBe(true);
  });

  it("accepts exactly the cap and refuses one past it", () => {
    expect(canSendReport("x".repeat(REPORT_REASON_MAX))).toBe(true);
    expect(canSendReport("x".repeat(REPORT_REASON_MAX + 1))).toBe(false);
  });

  /* Trimmed before measuring, so trailing newlines cannot push a reason that
     is within the cap over it. */
  it("measures the trimmed length, not the typed one", () => {
    expect(canSendReport(`  ${"x".repeat(REPORT_REASON_MAX)}  `)).toBe(true);
  });
});

describe("buildReportRequest", () => {
  it("sends the trimmed reason", () => {
    expect(buildReportRequest({ serverUserId: "user_1", reason: "  they kept at it  " })).toEqual({
      serverUserId: "user_1",
      reason: "they kept at it",
    });
  });
});
