import { describe, expect, it } from "vitest";

import { channelIsOpen, tabIndexOf } from "./tabs";

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

describe("whether a channel is open", () => {
  it("is true inside one on the server tab", () => {
    expect(channelIsOpen(["(tabs)", "(server)", "channel", "[id]"])).toBe(true);
  });

  it("is false on the channel list", () => {
    expect(channelIsOpen(["(tabs)", "(server)"])).toBe(false);
  });

  it("is false on another tab", () => {
    // A route outside the server tab cannot have a channel on top of it, and
    // answering true there would disable the pager on Search.
    expect(channelIsOpen(["(tabs)", "search"])).toBe(false);
    expect(channelIsOpen(["(tabs)", "you"])).toBe(false);
  });

  it("is false off the tabs entirely", () => {
    expect(channelIsOpen(["preferences"])).toBe(false);
  });
});
