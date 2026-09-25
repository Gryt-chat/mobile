import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    async getItem() {
      return null;
    },
    async setItem() {},
  },
}));

const { dismissFiltered, filteredSummary, getFiltered, recordFiltered } = await import("./contactFilterStore");

/** The quiet list of what the phone held back (GRYT-1470). */
describe("recordFiltered", () => {
  const at = 1;
  const base = { host: "h", conversationId: "dm_a", fromId: "x", fromName: "X", at } as const;

  it("folds a conversation and its messages into one row, and a call into its own", () => {
    recordFiltered({ ...base, kind: "conversation", reason: "setting" });
    recordFiltered({ ...base, kind: "message", reason: "setting" });
    recordFiltered({ ...base, kind: "message", reason: "setting" });
    recordFiltered({ ...base, kind: "call", reason: "setting" });
    const rows = getFiltered().filter((f) => f.conversationId === "dm_a");
    expect(rows.map((r) => [r.kind, r.count]).sort()).toEqual([["call", 1], ["message", 2]]);
    expect(rows.map(filteredSummary).sort()).toEqual(["Called you", "Sent 2 messages"]);

    dismissFiltered("h", "dm_a");
    expect(getFiltered().filter((f) => f.conversationId === "dm_a")).toHaveLength(0);
  });
});
