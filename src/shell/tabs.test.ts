import { describe, expect, it } from "vitest";

import { PAGE_SLOT, SWITCHER_PULL, channelIsOpen, nearestPage, pullsOpenServers, tabIndexOf } from "./tabs";

/* The case that matters is the one that is *not* a tab: a `return 0` fallthrough told
 * the pager to go to the server tab under whatever had just been pushed (GRYT-491). */

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

/**
 * The drawer opens when you are already at the left edge and pull further, and at no
 * other time. The case worth the test is the flick from another page.
 */
describe("pullsOpenServers", () => {
  it("opens when the first page is pulled further right", () => {
    expect(pullsOpenServers({ index: 0, settledPage: 0, thrown: -0.2 })).toBe(true);
  });

  it("does not open for a rubber-band that barely moved", () => {
    expect(pullsOpenServers({ index: 0, settledPage: 0, thrown: -SWITCHER_PULL / 2 })).toBe(false);
  });

  it("does not open on a hard flick from another page", () => {
    /* Search, thrown hard right: past the edge before nearestPage clamps it. */
    expect(pullsOpenServers({ index: 1, settledPage: 0, thrown: -3 })).toBe(false);
    expect(pullsOpenServers({ index: 2, settledPage: 0, thrown: -8 })).toBe(false);
  });

  it("does not open when the release lands on a different page", () => {
    expect(pullsOpenServers({ index: 0, settledPage: 1, thrown: -0.4 })).toBe(false);
  });

  it("does not open on a leftward drag", () => {
    expect(pullsOpenServers({ index: 0, settledPage: 0, thrown: 0.3 })).toBe(false);
  });

  it("opens exactly at the threshold", () => {
    expect(pullsOpenServers({ index: 0, settledPage: 0, thrown: -SWITCHER_PULL })).toBe(true);
  });
});

/**
 * Rounding since the slots became contiguous. The clamp is the part worth a test: the
 * version this replaced searched `PAGE_SLOT` and could not return anything outside it.
 */
describe("nearestPage", () => {
  it("lands on the slot a page is at", () => {
    expect(nearestPage(0)).toEqual({ slot: 0, page: 0 });
    expect(nearestPage(1)).toEqual({ slot: 1, page: 1 });
    expect(nearestPage(2)).toEqual({ slot: 2, page: 2 });
  });

  it("rounds to the nearer of two", () => {
    expect(nearestPage(0.4).page).toBe(0);
    expect(nearestPage(0.6).page).toBe(1);
    expect(nearestPage(1.51).page).toBe(2);
  });

  /** What the search used to give away and rounding does not. */
  it("clamps a throw past either end", () => {
    expect(nearestPage(-4)).toEqual({ slot: 0, page: 0 });
    expect(nearestPage(9)).toEqual({ slot: 2, page: 2 });
  });

  it("never answers with a slot that is not a page", () => {
    for (let at = -3; at <= 5; at += 0.25) {
      expect(PAGE_SLOT).toContain(nearestPage(at).slot);
    }
  });
});
