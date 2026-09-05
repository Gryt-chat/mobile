import { describe, expect, it } from "vitest";

import { parseClaims } from "./identityClaims";
import { parseHistory, parseScopes } from "./guestHistory";
import { identityScopeFor } from "./scope";

/* The parsing is the part with cases in it. The storage around it is
 * AsyncStorage, which vitest cannot load — same split as `authServer.ts`. */

describe("parseScopes", () => {
  it("reads the scopes that were stored", () => {
    expect(parseScopes(["a", "b"])).toEqual(["a", "b"]);
  });

  it("is empty for anything that is not a list of scopes", () => {
    expect(parseScopes(null)).toEqual([]);
    expect(parseScopes({})).toEqual([]);
    expect(parseScopes("gryt.test")).toEqual([]);
  });

  it("drops entries that are not usable scopes", () => {
    // An empty string would match `identityScopeFor("")`, which is what a
    // missing host produces — so it must never count as having been anywhere.
    expect(parseScopes(["a", "", 42, null, "b"])).toEqual(["a", "b"]);
  });
});

describe("parseHistory", () => {
  /* This stored a bare array until the prompt needed a date to show. Anybody
   * mid-membership when they update has that array on disk, and dropping it
   * would take the offer to convert a guest user off every server they had
   * already joined — silently, because a missing offer looks exactly like
   * having nothing to convert. */
  it("still reads the array the old version wrote", () => {
    expect([...parseHistory(["a", "b"])]).toEqual([
      ["a", { lastUsed: null }],
      ["b", { lastUsed: null }],
    ]);
  });

  it("keeps a date it was given", () => {
    expect(parseHistory({ a: { lastUsed: 1234 } }).get("a")).toEqual({ lastUsed: 1234 });
  });

  /* A date that is not a number is no date. The prompt drops the line rather
   * than printing "Invalid Date" at somebody deciding whether a user is theirs. */
  it("treats an unusable date as no date, without losing the server", () => {
    const history = parseHistory({ a: { lastUsed: "tuesday" }, b: null, c: {} });
    expect(history.get("a")).toEqual({ lastUsed: null });
    expect(history.get("b")).toEqual({ lastUsed: null });
    expect(history.get("c")).toEqual({ lastUsed: null });
    expect(history.size).toBe(3);
  });

  it("is empty for anything that is neither shape", () => {
    expect(parseHistory(null).size).toBe(0);
    expect(parseHistory("gryt.test").size).toBe(0);
  });

  // Same reason as parseScopes: an empty string is what a missing host
  // produces, and it must never count as having been anywhere.
  it("drops an empty scope", () => {
    expect(parseHistory({ "": { lastUsed: 1 } }).size).toBe(0);
    expect(parseHistory(["", "a"]).size).toBe(1);
  });
});

describe("parseClaims", () => {
  it("reads yes and no", () => {
    expect(parseClaims({ a: "yes", b: "no" })).toEqual({ a: "yes", b: "no" });
  });

  /* Unanswered means no, and anything unrecognised is unanswered. Failing this
   * way round means nothing is proved to anybody; the other way round would
   * disclose that an account and a guest are the same person, which cannot be
   * taken back. */
  it("drops anything that is not a decision", () => {
    expect(parseClaims({ a: "maybe", b: true, c: 1, d: null })).toEqual({});
  });

  it("is empty for anything that is not an object of decisions", () => {
    expect(parseClaims(null)).toEqual({});
    expect(parseClaims(["yes"])).toEqual({});
    expect(parseClaims("yes")).toEqual({});
  });
});

describe("identityScopeFor", () => {
  /* The key, the guest history and the claim all have to be filed under the
   * same string, so this is the one place that decides it. */
  it("is the normalised host, which is what the key is derived from today", () => {
    expect(identityScopeFor("https://gryt.test/foo")).toBe("gryt.test");
    expect(identityScopeFor("  gryt.test:5001  ")).toBe("gryt.test:5001");
  });

  it("is empty for no host, which nothing may treat as a scope", () => {
    expect(identityScopeFor("")).toBe("");
  });
});
