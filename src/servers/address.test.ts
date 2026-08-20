import { describe, expect, it } from "vitest";

import { normalizeCode, normalizeHost, parseServerInput } from "./address";

/* These cases are the desktop client's, because the two clients have to read
 * the same paste the same way. A server one of them can join and the other
 * cannot is the failure this guards, and it would show up as "the link works on
 * my laptop". */

describe("normalizeHost", () => {
  it("strips schemes, paths and whitespace", () => {
    expect(normalizeHost("https://gryt.chat/foo")).toBe("gryt.chat");
    expect(normalizeHost("wss://gryt.chat")).toBe("gryt.chat");
    expect(normalizeHost("  gryt.chat  ")).toBe("gryt.chat");
    expect(normalizeHost("gryt chat")).toBe("grytchat");
  });

  it("keeps the port, which is part of the address", () => {
    expect(normalizeHost("http://localhost:5001/")).toBe("localhost:5001");
    expect(normalizeHost("192.168.1.42:5001")).toBe("192.168.1.42:5001");
  });

  it("answers empty for nothing", () => {
    expect(normalizeHost("")).toBe("");
    expect(normalizeHost("   ")).toBe("");
  });
});

describe("normalizeCode", () => {
  it("lowercases and strips whitespace", () => {
    expect(normalizeCode("  AbC 123 ")).toBe("abc123");
  });
});

describe("parseServerInput", () => {
  it("reads a full invite link's host and code, not the link's own host", () => {
    // The trap: normalizeHost alone returns gryt.chat, and joining that instead
    // of the server named in the query is a confusing failure.
    expect(
      parseServerInput("https://gryt.chat/invite?host=chat.example.com&code=ABC123"),
    ).toEqual({ host: "chat.example.com", code: "abc123" });
  });

  it("reads a gryt:// invite, where 'invite' is the authority", () => {
    expect(
      parseServerInput("gryt://invite?host=chat.example.com&code=ABC123"),
    ).toEqual({ host: "chat.example.com", code: "abc123" });
  });

  it("reads a legacy /invite/<code> link against the default host", () => {
    expect(parseServerInput("https://app.gryt.chat/invite/XYZ")).toEqual({
      host: "app.gryt.chat",
      code: "xyz",
    });
  });

  it("takes the default legacy host from the caller when given one", () => {
    expect(
      parseServerInput("https://anything.example/invite/XYZ", {
        defaultLegacyHost: "other.example",
      }),
    ).toEqual({ host: "other.example", code: "xyz" });
  });

  it("treats a plain address as an address, with no code", () => {
    expect(parseServerInput("chat.example.com")).toEqual({
      host: "chat.example.com",
      code: "",
    });
    expect(parseServerInput("localhost:5001")).toEqual({
      host: "localhost:5001",
      code: "",
    });
  });

  it("does not mistake a bare hostname for a URL", () => {
    // `new URL("gryt.chat")` parses in some engines with "gryt.chat" as the
    // protocol, which is why the scheme is checked first.
    expect(parseServerInput("gryt.chat").host).toBe("gryt.chat");
  });

  it("falls through to an address when a link does not parse", () => {
    // A typo in a URL should get the address treatment rather than an error
    // about invite formats.
    expect(parseServerInput("https://not a url/invite").host).not.toBe("");
  });

  it("answers empty for nothing", () => {
    expect(parseServerInput("")).toEqual({ host: "", code: "" });
    expect(parseServerInput("   ")).toEqual({ host: "", code: "" });
  });
});
