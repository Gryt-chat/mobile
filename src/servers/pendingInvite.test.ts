import { describe, expect, it } from "vitest";

import { freshPendingInvite, PENDING_INVITE_MAX_AGE_MS } from "./pendingInvite";

/* Written when "Sign in to join" is pressed, read when the account comes back signed in.
 * A record older than a sign-in takes reopens a sheet nobody asked for, so it is dropped. */

const NOW = 1_700_000_000_000;
const record = (input: string, age: number) => JSON.stringify({ input, at: NOW - age });

describe("freshPendingInvite", () => {
  it("hands back what the sheet held, while the sign-in is still plausibly running", () => {
    expect(freshPendingInvite(record("gryt://invite?host=community.gryt.chat", 0), NOW)).toBe(
      "gryt://invite?host=community.gryt.chat",
    );
    expect(freshPendingInvite(record("chat.example.com", PENDING_INVITE_MAX_AGE_MS), NOW)).toBe(
      "chat.example.com",
    );
  });

  it("drops a record older than a sign-in takes", () => {
    expect(freshPendingInvite(record("chat.example.com", PENDING_INVITE_MAX_AGE_MS + 1), NOW)).toBeNull();
  });

  it("drops nothing, junk and a record with no address in it", () => {
    for (const raw of [null, undefined, "", "not json", "42", JSON.stringify({ at: NOW }), JSON.stringify({ input: "  ", at: NOW }), JSON.stringify({ input: "x" })]) {
      expect(freshPendingInvite(raw, NOW), String(raw)).toBeNull();
    }
  });
});
