import { describe, expect, it } from "vitest";

import { chooseTier } from "./tier";

describe("chooseTier", () => {
  it("prefers the account when there is one and the server takes it", () => {
    expect(chooseTier({ tiers: ["account", "local"], signedIn: true })).toEqual({ tier: "account" });
  });

  /* The same device key is behind both, and a guest membership can be linked to
   * the account later — so falling back beats refusing. */
  it("falls back to local on a server that does not do accounts", () => {
    expect(chooseTier({ tiers: ["local"], signedIn: true })).toEqual({ tier: "local" });
  });

  it("uses local when not signed in", () => {
    expect(chooseTier({ tiers: ["account", "local"], signedIn: false })).toEqual({ tier: "local" });
  });

  it("says what to do when the server takes only accounts and there is none", () => {
    const choice = chooseTier({ tiers: ["account"], signedIn: false });
    expect(choice).toMatchObject({ code: "account_required" });
    expect("refuse" in choice && choice.refuse).toMatch(/Sign in/);
  });

  /* Absent is not permissive: a server that never said predates the choice, and
   * back then it only ever meant accounts. */
  it("treats a server that never said as accounts only", () => {
    expect(chooseTier({ tiers: undefined, signedIn: true })).toEqual({ tier: "account" });
    expect(chooseTier({ tiers: undefined, signedIn: false })).toMatchObject({
      code: "account_required",
    });
  });

  it("refuses when the server offers nothing this app has", () => {
    const choice = chooseTier({ tiers: [], signedIn: true });
    expect("refuse" in choice && choice.refuse).toMatch(/does not accept/);
  });
});
