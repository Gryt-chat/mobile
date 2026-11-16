import { describe, expect, it } from "vitest";

import { issueUrl } from "./issueUrl";

describe("issueUrl", () => {
  it("opens the bug form with the message and where it happened", () => {
    const url = new URL(issueUrl({ type: "bug", message: "Calls drop", app: { version: "0.1.2", channel: "beta" }, device: { platform: "ios", osVersion: "27.0" } }));
    expect(url.searchParams.get("template")).toBe("bug_report.yml");
    expect(url.searchParams.get("what-happened")).toBe("Calls drop");
    expect(url.searchParams.get("environment")).toBe("- **OS:** ios 27.0\n- **Gryt version:** 0.1.2 beta");
  });

  it("opens the feature form for feedback, and keeps a long message within a URL", () => {
    const url = new URL(issueUrl({ type: "feedback", message: "x".repeat(5000) }));
    expect(url.searchParams.get("template")).toBe("feature_request.yml");
    expect(url.searchParams.get("problem")).toHaveLength(2000);
  });
});
