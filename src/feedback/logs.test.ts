import { describe, expect, it } from "vitest";

import { recentLogs, record } from "./logs";

describe("recent log", () => {
  it("strips %c styling and keeps the newest 300 lines", () => {
    record("warn", ["%cvoice%c joined", "color:red", "color:blue", { room: 1 }]);
    expect(recentLogs().at(-1)).toMatch(/ warn voice joined {"room":1}$/);

    for (let i = 0; i < 400; i++) record("error", [`line ${i}`]);
    const tail = recentLogs();
    expect(tail).toHaveLength(300);
    expect(tail.at(-1)).toMatch(/error line 399$/);
  });

  it("cuts a long line at 500 characters", () => {
    record("error", ["x".repeat(2000)]);
    expect(recentLogs().at(-1)).toHaveLength(501);
  });
});
