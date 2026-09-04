import { describe, expect, it } from "vitest";

import { ACCOUNT_ACTIONS, actionEndsSession } from "./accountActions";

/**
 * Which account actions leave nothing to be signed in to. Wrong one way, the
 * phone stays signed in as an account Keycloak has just deleted; wrong the
 * other, changing a password signs you out.
 */
describe("actionEndsSession", () => {
  it("is true for deleting the account", () => {
    expect(actionEndsSession("delete_account")).toBe(true);
  });

  it("is false for every action that leaves the account there", () => {
    for (const action of [
      ACCOUNT_ACTIONS.password,
      ACCOUNT_ACTIONS.email,
      ACCOUNT_ACTIONS.recoveryCodes,
      "CONFIGURE_TOTP",
      "webauthn-register-passwordless",
    ]) {
      expect(actionEndsSession(action)).toBe(false);
    }
  });

  it("is false for a plain sign-in, which passes no action at all", () => {
    expect(actionEndsSession("")).toBe(false);
  });

  it("does not match on a prefix", () => {
    // Keycloak aliases are exact. Something like delete_account_data would be a
    // different action, and treating it as this one would sign people out of an
    // account that still exists.
    expect(actionEndsSession("delete_account_data")).toBe(false);
    expect(actionEndsSession("DELETE_ACCOUNT")).toBe(false);
  });
});
