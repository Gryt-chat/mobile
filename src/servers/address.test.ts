import { describe, expect, it } from "vitest";

import {
  forgetScheme,
  getServerHttpBase,
  getServerWsBase,
  rememberScheme,
  restoreScheme,
  schemeConfirmed,
} from "./address";

/* These cases are the desktop client's, because the two clients have to read
 * the same paste the same way. A server one of them can join and the other
 * cannot is the failure this guards, and it would show up as "the link works on
 * my laptop". */

describe("bases", () => {
  it("defaults to plain, because Gryt's server has no TLS of its own", () => {
    forgetScheme("example.test");
    expect(getServerHttpBase("example.test")).toBe("http://example.test");
    expect(getServerWsBase("example.test")).toBe("ws://example.test");
  });

  it("follows what was learned about the host", () => {
    rememberScheme("example.test", "https");
    expect(getServerHttpBase("example.test")).toBe("https://example.test");
    // The socket has no redirect to follow, so this has to already be right.
    expect(getServerWsBase("example.test")).toBe("wss://example.test");
    forgetScheme("example.test");
  });

  it("follows a restored scheme the same way", () => {
    restoreScheme("example.test", "https");
    expect(getServerHttpBase("example.test")).toBe("https://example.test");
    expect(getServerWsBase("example.test")).toBe("wss://example.test");
    forgetScheme("example.test");
  });
});

/* The distinction the connection's error message rests on. GRYT-522. */
describe("confirmation", () => {
  it("separates a reply from a scheme read out of storage", () => {
    forgetScheme("example.test");
    expect(schemeConfirmed("example.test")).toBe(false);

    restoreScheme("example.test", "https");
    expect(schemeConfirmed("example.test")).toBe(false);

    rememberScheme("example.test", "https");
    expect(schemeConfirmed("example.test")).toBe(true);

    forgetScheme("example.test");
    expect(schemeConfirmed("example.test")).toBe(false);
  });
});
