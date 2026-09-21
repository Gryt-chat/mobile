import { describe, expect, it } from "vitest";

import {
  forgetScheme,
  getServerHttpBase,
  getServerWsBase,
  inviteLink,
  isPublicHost,
  parseServerInput,
  rememberScheme,
  restoreScheme,
  schemeConfirmed,
} from "./address";

/* These cases are the desktop client's, because the two have to read the same paste the
 * same way — the failure shows up as "the link works on my laptop". */

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

/* GRYT-1291. Core up to 0.6.0 read a link with only a host as gryt.chat, the link's own
   host, so pasting a link to an open server tried to join the wrong one. */
describe("parseServerInput", () => {
  it("reads a link with only a host as that server, with no code", () => {
    expect(parseServerInput("https://gryt.chat/invite?host=community.gryt.chat")).toEqual({
      host: "community.gryt.chat",
      code: "",
    });
    expect(parseServerInput("gryt://invite?host=chat.example.com:5001")).toEqual({
      host: "chat.example.com:5001",
      code: "",
    });
    expect(parseServerInput("https://app.gryt.chat/invite?host=chat.example.com&code=")).toEqual({
      host: "chat.example.com",
      code: "",
    });
  });

  it("still reads a link with a code, a legacy link and a plain address as core does", () => {
    expect(parseServerInput("https://gryt.chat/invite?host=chat.example.com&code=ABC123")).toEqual({
      host: "chat.example.com",
      code: "abc123",
    });
    expect(parseServerInput("https://app.gryt.chat/invite/XYZ")).toEqual({ host: "app.gryt.chat", code: "xyz" });
    expect(parseServerInput("https://app.gryt.chat/invite/XYZ?host=chat.example.com")).toEqual({
      host: "app.gryt.chat",
      code: "xyz",
    });
    expect(parseServerInput("chat.example.com")).toEqual({ host: "chat.example.com", code: "" });
    expect(parseServerInput("   ")).toEqual({ host: "", code: "" });
  });

  it("only treats an invite path as an invite", () => {
    expect(parseServerInput("https://gryt.chat/blog?host=chat.example.com")).toEqual({
      host: "gryt.chat",
      code: "",
    });
  });
});

describe("inviteLink", () => {
  it("builds the link parseServerInput reads back", () => {
    const withCode = inviteLink("chat.example.com:5001", "ABC123");
    expect(withCode).toBe("https://gryt.chat/invite?host=chat.example.com%3A5001&code=abc123");
    expect(parseServerInput(withCode)).toEqual({ host: "chat.example.com:5001", code: "abc123" });
  });

  it("leaves the code out entirely for a server anyone can join", () => {
    const hostOnly = inviteLink("community.gryt.chat");
    expect(hostOnly).toBe("https://gryt.chat/invite?host=community.gryt.chat");
    expect(inviteLink("community.gryt.chat", "   ")).toBe(hostOnly);
    expect(parseServerInput(hostOnly)).toEqual({ host: "community.gryt.chat", code: "" });
  });

  it("keeps an IPv6 address in brackets through the round trip", () => {
    expect(parseServerInput(inviteLink("[2001:db8::1]:5001"))).toEqual({
      host: "[2001:db8::1]:5001",
      code: "",
    });
  });
});

describe("isPublicHost", () => {
  it("accepts names and addresses that work from anywhere", () => {
    for (const host of [
      "community.gryt.chat",
      "chat.example.com:5001",
      "https://chat.example.com/",
      "Chat.Example.COM.",
      "8.8.8.8",
      "203.0.113.7:5001",
      "[2001:db8::1]:5001",
      "172.15.0.1",
      "172.32.0.1",
      "100.63.255.255",
      "100.128.0.1",
      "::ffff:8.8.8.8",
    ]) {
      expect(isPublicHost(host), host).toBe(true);
    }
  });

  it("refuses loopback, private, link-local and CGNAT addresses", () => {
    for (const host of [
      "localhost:5001",
      "127.0.0.1:5001",
      "127.8.9.10",
      "[::1]:5001",
      "::1",
      "app.localhost",
      "10.0.0.4",
      "172.16.0.1",
      "172.31.255.255:5001",
      "192.168.1.42:5001",
      "169.254.10.10",
      "100.64.0.1",
      "100.101.102.103",
      "0.0.0.0",
      "[fd12:3456::1]:5001",
      "fe80::1",
      "::ffff:192.168.1.5",
    ]) {
      expect(isPublicHost(host), host).toBe(false);
    }
  });

  it("refuses names that only resolve on one network, and nonsense", () => {
    for (const host of [
      "nas",
      "nas:5001",
      "box.local",
      "gryt.lan",
      "server.home",
      "gryt.internal",
      "gryt.home.arpa",
      "",
      "   ",
      "999.1.1.1",
    ]) {
      expect(isPublicHost(host), host).toBe(false);
    }
  });
});
