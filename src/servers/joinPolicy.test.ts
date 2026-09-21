import { describe, expect, it } from "vitest";

import { getServerJoinPolicy, readJoinPolicy, setServerJoinPolicy } from "./joinPolicy";

/* The same three words the desktop reads out of `server:info`. "Copy invite link" hangs
 * off this, so anything that is not plainly "open" has to read as not open. */

describe("readJoinPolicy", () => {
  it("takes the three policies a server can announce", () => {
    for (const policy of ["invite", "request", "open"]) {
      expect(readJoinPolicy(policy)).toBe(policy);
    }
  });

  it("reads anything else as unknown rather than open", () => {
    for (const junk of [undefined, null, "", "OPEN", "anyone", 1, {}]) {
      expect(readJoinPolicy(junk), String(junk)).toBeNull();
    }
  });
});

describe("setServerJoinPolicy", () => {
  it("remembers what each server said, and ignores junk", () => {
    setServerJoinPolicy("open.example", "open");
    setServerJoinPolicy("closed.example", "invite");
    expect(getServerJoinPolicy("open.example")).toBe("open");
    expect(getServerJoinPolicy("closed.example")).toBe("invite");

    setServerJoinPolicy("open.example", "anyone");
    expect(getServerJoinPolicy("open.example")).toBe("open");
    expect(getServerJoinPolicy("silent.example")).toBeNull();
  });

  it("follows a settings change announced later", () => {
    setServerJoinPolicy("changing.example", "open");
    setServerJoinPolicy("changing.example", "request");
    expect(getServerJoinPolicy("changing.example")).toBe("request");
  });
});
