import { describe, expect, it } from "vitest";

import {
  createInvitePayload,
  DEFAULT_DRAFT_INVITE,
  formatExpiry,
  formatUses,
  grantableRoles,
  inviteSummary,
  isInviteItem,
} from "./invites";

describe("isInviteItem", () => {
  it("accepts a payload with a non-empty code", () => {
    expect(isInviteItem({ code: "abc123" })).toBe(true);
  });

  it("refuses anything without one", () => {
    expect(isInviteItem({ code: "" })).toBe(false);
    expect(isInviteItem({})).toBe(false);
    expect(isInviteItem(null)).toBe(false);
    expect(isInviteItem("abc123")).toBe(false);
  });
});

describe("formatExpiry", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");

  it("says Never with no expiry", () => {
    expect(formatExpiry(null, now)).toBe("Never");
    expect(formatExpiry(undefined, now)).toBe("Never");
  });

  it("says Expired once the time has passed", () => {
    expect(formatExpiry(new Date(now - 1000), now)).toBe("Expired");
  });

  it("breaks the remainder into days, hours and minutes", () => {
    const in25h30m = new Date(now + (25 * 60 + 30) * 60_000);
    expect(formatExpiry(in25h30m, now)).toBe("1d 1h 30m");
  });

  it("shows 0m rather than nothing for under a minute", () => {
    expect(formatExpiry(new Date(now + 10_000), now)).toBe("0m");
  });
});

describe("formatUses", () => {
  it("shows the infinity symbol for a negative cap", () => {
    expect(formatUses(3, -1)).toBe("∞");
  });

  it("shows remaining over max when there is a cap", () => {
    expect(formatUses(4, 10)).toBe("4 / 10");
  });

  it("shows just the remaining count with no cap sent", () => {
    expect(formatUses(4, undefined)).toBe("4");
  });

  it("shows a question mark once remaining itself is unknown", () => {
    expect(formatUses(undefined, 10)).toBe("?");
  });
});

describe("inviteSummary", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");

  it("counts consumed uses against infinity for an infinite invite", () => {
    expect(inviteSummary({ code: "x", maxUses: -1, usesConsumed: 7 }, now)).toBe(
      "Uses: 7 / ∞ · Expires: Never",
    );
  });

  it("names revoked invites", () => {
    expect(
      inviteSummary({ code: "x", maxUses: 5, usesRemaining: 5, revoked: true }, now),
    ).toBe("Uses: 5 / 5 · Expires: Never · Revoked");
  });
});

describe("createInvitePayload", () => {
  it("defaults to one use and no expiry", () => {
    expect(createInvitePayload(DEFAULT_DRAFT_INVITE)).toEqual({
      maxUses: 1,
      expiresInHours: undefined,
      note: null,
      customCode: null,
      grantsRole: null,
    });
  });

  it("sends infinite rather than a max when the switch is on", () => {
    const payload = createInvitePayload({ ...DEFAULT_DRAFT_INVITE, infiniteUses: true, maxUses: "1" });
    expect(payload).toEqual({
      infinite: true,
      expiresInHours: undefined,
      note: null,
      customCode: null,
      grantsRole: null,
    });
  });

  it("clamps max uses to between 1 and 1000", () => {
    expect(createInvitePayload({ ...DEFAULT_DRAFT_INVITE, maxUses: "0" }).maxUses).toBe(1);
    expect(createInvitePayload({ ...DEFAULT_DRAFT_INVITE, maxUses: "5000" }).maxUses).toBe(1000);
    expect(createInvitePayload({ ...DEFAULT_DRAFT_INVITE, maxUses: "not a number" }).maxUses).toBe(1);
  });

  it("lower-cases and trims a custom code", () => {
    expect(
      createInvitePayload({ ...DEFAULT_DRAFT_INVITE, customCode: "  Friends  " }).customCode,
    ).toBe("friends");
  });

  it("leaves expiresInHours out for a blank or non-positive field", () => {
    expect(createInvitePayload({ ...DEFAULT_DRAFT_INVITE, expiresInHours: "" }).expiresInHours).toBeUndefined();
    expect(createInvitePayload({ ...DEFAULT_DRAFT_INVITE, expiresInHours: "-3" }).expiresInHours).toBeUndefined();
    expect(createInvitePayload({ ...DEFAULT_DRAFT_INVITE, expiresInHours: "24" }).expiresInHours).toBe(24);
  });

  it("passes the picked role through, or null for none", () => {
    expect(createInvitePayload({ ...DEFAULT_DRAFT_INVITE, grantsRole: "mod" }).grantsRole).toBe("mod");
    expect(createInvitePayload(DEFAULT_DRAFT_INVITE).grantsRole).toBeNull();
  });
});

describe("grantableRoles", () => {
  it("keeps only roles marked invite-grantable", () => {
    const roles = [
      { id: "mod", name: "Mod", grantableByInvite: true },
      { id: "admin", name: "Admin", grantableByInvite: false },
      { id: "vip", name: "VIP" },
    ];
    expect(grantableRoles(roles).map((r) => r.id)).toEqual(["mod"]);
  });
});
