import { describe, expect, it } from "vitest";

import { camerasFrom, sharesFrom, videoStreamIds, type ServerClient } from "./shares";

const sharing = (over: Partial<ServerClient> = {}): ServerClient => ({
  serverUserId: "u1",
  nickname: "Sivert",
  voiceChannelId: "voice",
  screenShareEnabled: true,
  screenShareVideoStreamID: "stream-1",
  ...over,
});

describe("sharesFrom", () => {
  it("finds somebody sharing in your channel", () => {
    expect(sharesFrom({ a: sharing() }, "voice", "me")).toEqual([
      { serverUserId: "u1", nickname: "Sivert", streamId: "stream-1" },
    ]);
  });

  it("ignores anybody who is not", () => {
    expect(sharesFrom({ a: sharing({ screenShareEnabled: false }) }, "voice", "me")).toEqual([]);
  });

  /* `server:clients` is the whole server. Somebody sharing two channels away is
   * not something to put on your screen. */
  it("ignores a share in another channel", () => {
    expect(sharesFrom({ a: sharing({ voiceChannelId: "other" }) }, "voice", "me")).toEqual([]);
  });

  /* True on a phone only until GRYT-557, and a hall of mirrors after it. */
  it("ignores your own", () => {
    expect(sharesFrom({ a: sharing({ serverUserId: "me" }) }, "voice", "me")).toEqual([]);
  });

  /* The flag and the stream id are set by different events and can be a moment
   * apart. Drawing the gap is a black rectangle with a name under it. */
  it("ignores a share with no stream behind it", () => {
    expect(sharesFrom({ a: sharing({ screenShareVideoStreamID: "" }) }, "voice", "me")).toEqual([]);
    expect(
      sharesFrom({ a: sharing({ screenShareVideoStreamID: undefined }) }, "voice", "me"),
    ).toEqual([]);
  });

  it("gives back nothing when you are in no channel", () => {
    expect(sharesFrom({ a: sharing() }, null, "me")).toEqual([]);
    expect(sharesFrom(null, "voice", "me")).toEqual([]);
  });

  it("names them null rather than guessing", () => {
    expect(sharesFrom({ a: sharing({ nickname: "" }) }, "voice", "me")[0].nickname).toBeNull();
  });

  it("finds more than one", () => {
    const clients = {
      a: sharing(),
      b: sharing({ serverUserId: "u2", nickname: "Ada", screenShareVideoStreamID: "stream-2" }),
    };
    expect(sharesFrom(clients, "voice", "me").map((s) => s.streamId)).toEqual([
      "stream-1",
      "stream-2",
    ]);
  });
});

describe("camerasFrom", () => {
  const withCamera = (over: Partial<ServerClient> = {}): ServerClient => ({
    serverUserId: "u1",
    voiceChannelId: "voice",
    cameraEnabled: true,
    cameraStreamID: "cam-1",
    ...over,
  });

  it("maps a person to their camera stream", () => {
    expect([...camerasFrom({ a: withCamera() }, "voice")]).toEqual([["u1", "cam-1"]]);
  });

  /* Unlike a share: a self view is a thing people expect, so leaving yourself
   * out here would only move the special case to the call site. */
  it("includes your own", () => {
    expect(camerasFrom({ a: withCamera({ serverUserId: "me" }) }, "voice").get("me")).toBe("cam-1");
  });

  it("ignores a camera in another channel", () => {
    expect(camerasFrom({ a: withCamera({ voiceChannelId: "other" }) }, "voice").size).toBe(0);
  });

  it("ignores the flag without a stream, same as a share", () => {
    expect(camerasFrom({ a: withCamera({ cameraStreamID: "" }) }, "voice").size).toBe(0);
    expect(camerasFrom({ a: withCamera({ cameraEnabled: false }) }, "voice").size).toBe(0);
  });
});

describe("videoStreamIds", () => {
  it("collects cameras and screens in the channel", () => {
    const clients = {
      a: sharing({ serverUserId: "u1", cameraEnabled: true, cameraStreamID: "cam-1" }),
      b: sharing({ serverUserId: "u2", screenShareVideoStreamID: "screen-2" }),
    };
    expect(videoStreamIds(clients, "voice")).toEqual(new Set(["cam-1", "stream-1", "screen-2"]));
  });

  /* Unlike `sharesFrom`. This is the list of ids that are not people, and your
     own camera is no more a person than anybody else's. */
  it("includes your own", () => {
    const clients = { a: sharing({ serverUserId: "me", cameraStreamID: "my-cam" }) };
    expect(videoStreamIds(clients, "voice").has("my-cam")).toBe(true);
  });

  it("ignores another channel", () => {
    const clients = { a: sharing({ voiceChannelId: "other", cameraStreamID: "cam-1" }) };
    expect(videoStreamIds(clients, "voice")).toEqual(new Set());
  });

  /* The flag can be false while the id is still set — the two are written by
     different events and are briefly out of step. An id that names a video
     stream is not a person whichever way the flag is pointing. */
  it("takes the id even when the flag is off", () => {
    const clients = {
      a: sharing({ cameraEnabled: false, cameraStreamID: "cam-1", screenShareEnabled: false }),
    };
    expect(videoStreamIds(clients, "voice").has("cam-1")).toBe(true);
  });

  it("is empty without clients or a channel", () => {
    expect(videoStreamIds(null, "voice")).toEqual(new Set());
    expect(videoStreamIds({ a: sharing() }, null)).toEqual(new Set());
  });
});
