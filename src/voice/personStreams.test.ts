import { describe, expect, it } from "vitest";

import { personStreamIds, withChannelMembers } from "./shares";

const media = (audio: number, video: number) => ({
  getAudioTracks: () => Array.from({ length: audio }),
  getVideoTracks: () => Array.from({ length: video }),
});

describe("personStreamIds", () => {
  it("keeps people and drops our own, video-kind and named video streams", () => {
    const ids = personStreamIds(
      {
        alice: { isLocal: false, stream: media(1, 0) },
        me: { isLocal: true, stream: media(1, 0) },
        cam: { isLocal: false, kind: "video", stream: media(0, 1) },
        share: { isLocal: false, stream: media(0, 1) },
      },
      new Set(["share"]),
      new Set(),
    );
    expect(ids).toEqual(["alice"]);
  });

  it("never turns a camera that was switched off into a tile called Someone (GRYT-1650)", () => {
    // Off: the server no longer names it, but it was video earlier in this call.
    const lingering = { isLocal: false, stream: media(1, 0) };
    expect(personStreamIds({ oldcam: lingering }, new Set(), new Set(["oldcam"]))).toEqual([]);
  });

  it("drops a stream that only carries video even if nobody named it", () => {
    expect(personStreamIds({ x: { isLocal: false, stream: media(0, 1) } }, new Set(), new Set())).toEqual([]);
  });

  it("keeps a person whose stream says nothing about its tracks, as before", () => {
    expect(personStreamIds({ bob: { isLocal: false } }, new Set(), new Set())).toEqual(["bob"]);
  });
});

describe("withChannelMembers", () => {
  const m = (serverUserId: string, streamID: string, voiceChannelId = "voice") => ({ serverUserId, streamID, voiceChannelId });

  it("adds people in the channel the engine has no stream for", () => {
    const ids = withChannelMembers(["a"], [m("u1", "a"), m("u2", "b"), m("u3", "c", "other"), m("me", "d"), m("u4", "")], "voice", "me");
    expect(ids).toEqual(["a", "b"]);
  });

  it("adds nobody outside a call", () => {
    expect(withChannelMembers([], [m("u2", "b")], null, "me")).toEqual([]);
  });
});
