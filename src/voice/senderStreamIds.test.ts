import { describe, expect, it } from "vitest";

import { senderStreamId } from "./senderStreamIds";

describe("senderStreamId", () => {
  /* voice 0.5.9 pauses the camera's sender instead of removing it (GRYT-1329), so the
   * camera coming back resumes the first sender under the first stream's id. */
  it("keeps the first camera's id through the camera going off and on", () => {
    const pc = {};
    expect(senderStreamId(pc, "camera", "camera-1")).toBe("camera-1");
    expect(senderStreamId(pc, "camera", "camera-2")).toBe("camera-1");
    expect(senderStreamId(pc, "camera", "camera-3")).toBe("camera-1");
  });

  it("keeps the first share's id for a second share", () => {
    const pc = {};
    expect(senderStreamId(pc, "screenVideo", "share-1")).toBe("share-1");
    expect(senderStreamId(pc, "screenVideo", "share-2")).toBe("share-1");
  });

  it("keeps the camera and the screen apart", () => {
    const pc = {};
    expect(senderStreamId(pc, "screenVideo", "share-1")).toBe("share-1");
    expect(senderStreamId(pc, "camera", "camera-1")).toBe("camera-1");
    expect(senderStreamId(pc, "screenVideo", "share-2")).toBe("share-1");
    expect(senderStreamId(pc, "camera", "camera-2")).toBe("camera-1");
  });

  it("starts over on a new connection", () => {
    const first = {};
    const second = {};
    expect(senderStreamId(first, "camera", "camera-1")).toBe("camera-1");
    expect(senderStreamId(first, "screenVideo", "share-1")).toBe("share-1");
    expect(senderStreamId(second, "camera", "camera-2")).toBe("camera-2");
    expect(senderStreamId(second, "screenVideo", "share-2")).toBe("share-2");
    expect(senderStreamId(first, "camera", "camera-3")).toBe("camera-1");
  });

  it("uses the stream's own id with no connection, and remembers nothing", () => {
    expect(senderStreamId(null, "camera", "camera-1")).toBe("camera-1");
    expect(senderStreamId(undefined, "camera", "camera-2")).toBe("camera-2");
    expect(senderStreamId(null, "screenVideo", "share-1")).toBe("share-1");
  });
});
