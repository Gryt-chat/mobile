import { describe, expect, it } from "vitest";

import { massMentionPrompt } from "./massMention";

const members = [
  { serverUserId: "me", status: "online" as const },
  { serverUserId: "a", status: "online" as const },
  { serverUserId: "b", status: "offline" as const },
  { serverUserId: "c" },
];

describe("asking before a mass mention", () => {
  it("counts everyone but me for @everyone", () => {
    expect(massMentionPrompt("hi @everyone", members, "me")?.title).toBe("Notify up to 3 people?");
    expect(massMentionPrompt("hi @everyone", members, "me")?.message).toContain("2 of them are online");
  });

  it("counts only who is online for @here", () => {
    expect(massMentionPrompt("@here standup", members, "me")?.title).toBe("Notify up to 2 people?");
  });

  it("does not ask when nobody would be pinged", () => {
    expect(massMentionPrompt("@here", [{ serverUserId: "me" }, { serverUserId: "b", status: "offline" }], "me")).toBeNull();
  });

  it("ignores text without a mass mention", () => {
    expect(massMentionPrompt("mail me@everyone.com", members, "me")).toBeNull();
    expect(massMentionPrompt("@everyoneelse", members, "me")).toBeNull();
  });
});
