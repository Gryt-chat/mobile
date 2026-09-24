import { describe, expect, it } from "vitest";

import { mentionsMe, tokenHits, type MentionReader } from "./mentionReader";

const reader: MentionReader = {
  meId: "user_me",
  roleIds: ["crew"],
  suppressEveryone: false,
  massAllowed: true,
  roles: new Map(),
  channelName: () => null,
  openChannel: () => {},
};

describe("tokenHits", () => {
  it("hits on @everyone, @here and a held role in a channel", () => {
    expect(tokenHits({ kind: "everyone" }, reader)).toBe(true);
    expect(tokenHits({ kind: "role", id: "crew" }, reader)).toBe(true);
    expect(tokenHits({ kind: "role", id: "mods" }, reader)).toBe(false);
  });

  it("leaves @everyone alone while suppressed, and in a DM", () => {
    expect(tokenHits({ kind: "here" }, { ...reader, suppressEveryone: true })).toBe(false);
    expect(tokenHits({ kind: "everyone" }, { ...reader, massAllowed: false })).toBe(false);
  });
});

describe("mentionsMe, for Only mentions", () => {
  const me = { serverUserId: "user_me", nickname: "Obsidian", roleIds: ["crew"] };

  it("counts being named, @everyone and a held role", () => {
    expect(mentionsMe("hey @obsidian", me)).toBe(true);
    expect(mentionsMe("[@everyone](mention:everyone) hi", me)).toBe(true);
    expect(mentionsMe("[@Crew](role:crew) hi", me)).toBe(true);
  });

  it("does not count plain text, another role, or a suppressed @everyone", () => {
    expect(mentionsMe("@everyone went out as text", me)).toBe(false);
    expect(mentionsMe("[@Mods](role:mods)", me)).toBe(false);
    expect(mentionsMe("[@here](mention:here)", { ...me, suppressEveryone: true })).toBe(false);
  });
});
