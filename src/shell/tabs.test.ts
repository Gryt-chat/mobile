import { describe, expect, it } from "vitest";

import { PAGE_SLOT, SWITCHER_SIZE, channelIsOpen, commitsPull, nearestPage, pullFraction, tabIndexOf } from "./tabs";

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

/**
 * The drag, not a threshold. The panel comes out under the finger, so the two
 * numbers that matter are how far the finger has brought it and whether letting
 * go there keeps it.
 */
describe("pullFraction", () => {
  it("is nothing until the drag passes the edge", () => {
    expect(pullFraction(0)).toBe(0);
    expect(pullFraction(0.4)).toBe(0);
  });

  /* One point of panel for one point of finger. Dividing by the drawer's own
     share of the screen is what buys that; get it wrong and the panel trails
     the thumb at a fixed ratio, which reads as the app being slow rather than
     as a number being off. */
  it("tracks the finger one to one", () => {
    expect(pullFraction(-SWITCHER_SIZE)).toBeCloseTo(1);
    expect(pullFraction(-SWITCHER_SIZE / 2)).toBeCloseTo(0.5);
  });

  it("cannot go past open", () => {
    expect(pullFraction(-3)).toBe(1);
  });
});

describe("commitsPull", () => {
  it("keeps a drag that got past halfway", () => {
    expect(commitsPull(0.6, 0, 300)).toBe(true);
    expect(commitsPull(0.4, 0, 300)).toBe(false);
  });

  /* The flick: barely moved, thrown hard. It is the gesture people actually
     make when they want the drawer, and a distance-only rule refuses it. */
  it("keeps a short drag that was thrown", () => {
    expect(commitsPull(0.2, 900, 300)).toBe(true);
  });

  it("lets go of a long drag thrown back", () => {
    expect(commitsPull(0.7, -900, 300)).toBe(false);
  });

  it("does not divide by a zero extent", () => {
    expect(commitsPull(0.6, 5000, 0)).toBe(true);
    expect(commitsPull(0.2, 5000, 0)).toBe(false);
  });
});

/**
 * Rounding since the phone left the bar and the slots became contiguous
 * (GRYT-948). The clamp is the part worth having a test for: the version this
 * replaced searched `PAGE_SLOT` for the closest entry, which could not return
 * anything outside it, so a flick past either end was handled without anyone
 * writing it down. A rounding has no such floor.
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
