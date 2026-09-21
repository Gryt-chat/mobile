import { describe, expect, it } from "vitest";

import { joinSheetView, type JoinSheetInput } from "./joinSheet";

/* The same cases the desktop checks its invite dialog against (scripts/check-invite-link.mjs
 * in the client), so a link behaves the same whichever app opens it. */

const base: JoinSheetInput = {
  linkCode: "",
  typedCode: "",
  info: { identityTiers: ["local", "account"], joinPolicy: "open" },
  signedIn: false,
  alreadyAdded: false,
};

const view = (patch: Partial<JoinSheetInput>) => joinSheetView({ ...base, ...patch });

describe("joinSheetView", () => {
  it("joins a server anyone can join from a host-only link with nothing typed", () => {
    const v = view({});
    expect(v.action).toEqual({ kind: "join", disabled: false });
    expect(v.showCodeField).toBe(false);
    expect(v.code).toBe("");
  });

  it("still sends a link's code to an open server, so a role on the invite lands", () => {
    const v = view({ linkCode: "trusted1" });
    expect(v.code).toBe("trusted1");
    expect(v.showCodeField).toBe(false);
    expect(v.action).toEqual({ kind: "join", disabled: false });
  });

  it("asks an invite-only server's visitor for a code, and waits for one", () => {
    const invite = { identityTiers: ["local" as const], joinPolicy: "invite" as const };
    const v = view({ info: invite });
    expect(v.showCodeField).toBe(true);
    expect(v.codeRequired).toBe(true);
    expect(v.action).toEqual({ kind: "join", disabled: true });

    const typed = view({ info: invite, typedCode: "abc" });
    expect(typed.code).toBe("abc");
    expect(typed.action).toEqual({ kind: "join", disabled: false });
  });

  it("asks for a code but does not require one where the network lets you in", () => {
    const v = view({ info: { identityTiers: ["local"], joinPolicy: "invite", lanOpen: true } });
    expect(v.showCodeField).toBe(true);
    expect(v.codeRequired).toBe(false);
    expect(v.action).toEqual({ kind: "join", disabled: false });
  });

  it("does not ask for a code when the link already carries one", () => {
    const v = view({ linkCode: "abc", info: { identityTiers: ["local"], joinPolicy: "invite" } });
    expect(v.showCodeField).toBe(false);
    expect(v.action).toEqual({ kind: "join", disabled: false });
  });

  it("offers sign-in on a server that only takes accounts, whatever the link carries", () => {
    for (const linkCode of ["", "abc"]) {
      const accounts = { identityTiers: ["account" as const], joinPolicy: "open" as const };
      const v = view({ linkCode, info: accounts });
      expect(v.needsAccount, linkCode || "host-only").toBe(true);
      expect(v.action).toEqual({ kind: "sign-in" });

      const signedIn = view({ linkCode, info: accounts, signedIn: true });
      expect(signedIn.action.kind).toBe("join");
    }
  });

  it("tells nobody to sign in before the keychain has answered, or on an older server", () => {
    expect(view({ signedIn: undefined, info: { identityTiers: ["account"], joinPolicy: "open" } }).action.kind).toBe("join");
    expect(view({ info: { joinPolicy: "open" } }).needsAccount).toBe(false);
  });

  it("says already added before anything else", () => {
    expect(view({ alreadyAdded: true, info: { identityTiers: ["account"], joinPolicy: "invite" } }).action).toEqual({
      kind: "already",
    });
  });
});
