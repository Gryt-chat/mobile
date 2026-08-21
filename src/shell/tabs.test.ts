import { describe, expect, it } from "vitest";

import { tabIndexOf } from "./tabs";

/* The case that matters is the one that is *not* a tab. Answering 0 for it —
 * which is what a `return 0` fallthrough did — told the pager to go to the
 * server tab underneath whatever had just been pushed, and on `/dev`, which is
 * presented as a modal, you could watch it happen. GRYT-491. */

describe("tabIndexOf", () => {
  it("finds each tab by its own segment", () => {
    expect(tabIndexOf(["(tabs)", "(server)"])).toBe(0);
    expect(tabIndexOf(["(tabs)", "search"])).toBe(1);
    expect(tabIndexOf(["(tabs)", "you"])).toBe(2);
  });

  it("still finds the server tab from a channel inside it", () => {
    expect(tabIndexOf(["(tabs)", "(server)", "channel", "[id]"])).toBe(0);
  });

  it("answers null for a route pushed on the root stack", () => {
    // The three that exist today, and the reason this function returns null.
    expect(tabIndexOf(["dev"])).toBeNull();
    expect(tabIndexOf(["identity"])).toBeNull();
    expect(tabIndexOf(["preferences"])).toBeNull();
  });

  it("answers null rather than the first tab for anything unrecognised", () => {
    expect(tabIndexOf([])).toBeNull();
    expect(tabIndexOf(["invite"])).toBeNull();
  });
});
