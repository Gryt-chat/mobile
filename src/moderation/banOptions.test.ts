import { describe, expect, it } from "vitest";

import {
  BAN_DURATIONS,
  buildBanRequest,
  canRevokeInvite,
  describeInvite,
  minutesFor,
  REASON_MAX,
  type MemberInvite,
} from "./banOptions";

const invite = (over: Partial<MemberInvite> = {}): MemberInvite => ({
  targetServerUserId: "u1", code: "abc", active: true, usesConsumed: 3, maxUses: 10, ...over,
});

const build = (over: Partial<Parameters<typeof buildBanRequest>[0]> = {}) =>
  buildBanRequest({
    targetServerUserId: "u1", reason: "", durationId: "permanent",
    deleteContent: true, revokeInvite: false, invite: null, ...over,
  });

describe("minutesFor", () => {
  it("maps every offered duration", () => {
    expect(BAN_DURATIONS.map((d) => minutesFor(d.id))).toEqual([60, 1440, 10080, 43200, null]);
  });

  /* A typo in a duration id must not silently become a one-hour ban. */
  it("treats an unknown duration as permanent", () => {
    expect(minutesFor("1y")).toBeNull();
  });
});

describe("canRevokeInvite", () => {
  it("is true only for an invite still open", () => {
    expect(canRevokeInvite(invite())).toBe(true);
    expect(canRevokeInvite(invite({ active: false }))).toBe(false);
  });

  it("is false when they did not arrive on one", () => {
    expect(canRevokeInvite(invite({ code: null }))).toBe(false);
    expect(canRevokeInvite(null)).toBe(false);
    expect(canRevokeInvite(undefined)).toBe(false);
  });
});

describe("buildBanRequest", () => {
  it("drops a blank reason rather than sending an empty string", () => {
    expect(build({ reason: "   " }).reason).toBeUndefined();
  });

  it("trims a reason and keeps it", () => {
    expect(build({ reason: "  spam  " }).reason).toBe("spam");
  });

  it("caps the reason at what the server accepts", () => {
    expect(build({ reason: "x".repeat(500) }).reason).toHaveLength(REASON_MAX);
  });

  it("carries the duration through as minutes", () => {
    expect(build({ durationId: "7d" }).expiresInMinutes).toBe(10080);
    expect(build({ durationId: "permanent" }).expiresInMinutes).toBeNull();
  });

  /*
   * The one that matters. The toggle is per-member and the screen is reused,
   * so a revoke left on from somebody who arrived on an invite must not close
   * an unrelated one for somebody who did not.
   */
  it("refuses to revoke when there is no live invite, whatever the toggle says", () => {
    expect(build({ revokeInvite: true, invite: null }).revokeInvite).toBe(false);
    expect(build({ revokeInvite: true, invite: invite({ active: false }) }).revokeInvite).toBe(false);
    expect(build({ revokeInvite: true, invite: invite({ code: null }) }).revokeInvite).toBe(false);
  });

  it("revokes when there is one and the moderator asked", () => {
    expect(build({ revokeInvite: true, invite: invite() }).revokeInvite).toBe(true);
  });

  it("passes deleteContent straight through", () => {
    expect(build({ deleteContent: false }).deleteContent).toBe(false);
  });
});

describe("describeInvite", () => {
  it("says how much of it is spent", () => {
    expect(describeInvite(invite())).toBe("3 of 10 used");
  });

  it("does not invent a limit for an unlimited invite", () => {
    expect(describeInvite(invite({ maxUses: 0, usesConsumed: 41 }))).toBe("used 41 times");
  });
});
