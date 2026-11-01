import { describe, expect, it } from "vitest";

import { activityOn, nextActivity } from "./offscreenActivity";

const row = (key: string, top: number, mentions = 0) => ({ key, top, height: 50, mentions });

describe("activityOn", () => {
  const rows = [row("a", 0), row("b", 200), row("c", 600), row("d", 900, 2)];

  it("finds what's past each edge, nearest first", () => {
    expect(activityOn(rows, "above", 300, 700).map((r) => r.key)).toEqual(["b", "a"]);
    expect(activityOn(rows, "below", 0, 500).map((r) => r.key)).toEqual(["c", "d"]);
  });

  it("counts a row as out once its middle is past the edge", () => {
    expect(activityOn([row("a", 480)], "below", 0, 500)).toHaveLength(1);
    expect(activityOn([row("a", 470)], "below", 0, 500)).toHaveLength(0);
  });

  it("has nothing when everything is in view", () => {
    expect(activityOn(rows, "above", 0, 1000)).toEqual([]);
    expect(activityOn(rows, "below", 0, 1000)).toEqual([]);
  });
});

describe("nextActivity", () => {
  it("goes to the nearest mention before a nearer plain unread", () => {
    expect(nextActivity([row("a", 0), row("b", 100, 1)])?.key).toBe("b");
  });

  it("goes to the nearest when nothing names you", () => {
    expect(nextActivity([row("a", 0), row("b", 100)])?.key).toBe("a");
  });
});
