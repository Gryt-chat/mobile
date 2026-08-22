import { afterEach, describe, expect, it } from "vitest";

import { forgetScheme, rememberScheme } from "../servers/address";
import { indexMembers, memberAvatarUrl } from "./members";
import type { Member } from "./types";

function member(over: Partial<Member> & { serverUserId: string }): Member {
  return { nickname: "Someone", ...over };
}

describe("indexMembers", () => {
  it("finds a member by their server user id", () => {
    const sivert = member({ serverUserId: "u1", nickname: "sivert" });

    expect(indexMembers([sivert]).byId.get("u1")).toBe(sivert);
  });

  /* The whole reason this exists. `@gryt/voice` keys its streams by stream id
   * and carries no identity at all, so this is the only way a voice tile can
   * say who it is. GRYT-452 called it a boundary needing the engine to change;
   * the server had already sent the answer. */
  it("finds a member by the stream they are publishing", () => {
    const sivert = member({ serverUserId: "u1", nickname: "sivert", streamID: "s-9" });

    expect(indexMembers([sivert]).byStreamId.get("s-9")).toBe(sivert);
  });

  it("does not index anyone who is not in a call", () => {
    // The server writes `onlineClient?.streamID || ''`, so everybody not in a
    // call shares the empty string. Indexing it would make whichever of them
    // came last the answer for a stream with no member at all — which is the
    // one case this lookup exists to report as unknown.
    const index = indexMembers([
      member({ serverUserId: "u1", streamID: "" }),
      member({ serverUserId: "u2" }),
      member({ serverUserId: "u3", streamID: "s-9" }),
    ]);

    expect(index.byStreamId.get("")).toBeUndefined();
    expect(index.byStreamId.size).toBe(1);
  });

  it("answers nothing for a stream nobody claims", () => {
    const index = indexMembers([member({ serverUserId: "u1", streamID: "s-9" })]);

    // Somebody who joined the call a moment before the list caught up. The tile
    // is still drawn, unnamed, rather than dropped.
    expect(index.byStreamId.get("s-unknown")).toBeUndefined();
  });

  it("is empty for an empty list rather than throwing", () => {
    const index = indexMembers([]);

    expect(index.byId.size).toBe(0);
    expect(index.byStreamId.size).toBe(0);
  });
});

describe("memberAvatarUrl", () => {
  afterEach(() => forgetScheme("gryt.test"));

  it("points at the uploads route on the scheme the server answered on", () => {
    rememberScheme("gryt.test", "https");

    expect(
      memberAvatarUrl("gryt.test", member({ serverUserId: "u1", avatarFileId: "f1" })),
    ).toBe("https://gryt.test/api/uploads/files/f1");
  });

  it("is null for a member who has uploaded nothing", () => {
    expect(memberAvatarUrl("gryt.test", member({ serverUserId: "u1" }))).toBeNull();
    expect(
      memberAvatarUrl("gryt.test", member({ serverUserId: "u1", avatarFileId: null })),
    ).toBeNull();
  });

  it("is null for a member nobody has, and with no server", () => {
    expect(memberAvatarUrl("gryt.test", undefined)).toBeNull();
    expect(
      memberAvatarUrl(null, member({ serverUserId: "u1", avatarFileId: "f1" })),
    ).toBeNull();
  });
});
