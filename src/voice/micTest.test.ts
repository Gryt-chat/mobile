import { describe, expect, it } from "vitest";

import {
  barHeight,
  HISTORY,
  micVerdict,
  pushLevel,
  readMicStats,
  SILENCE,
} from "./micTest";

/**
 * The four readings this screen exists to tell apart. From inside a call they all look
 * the same, so the one that matters is "heard something, sent nothing".
 */

const entry = (fields: Record<string, unknown>): [string, unknown] => ["id", fields];

describe("readMicStats", () => {
  it("takes the level from the audio source and the bytes from the audio sender", () => {
    expect(
      readMicStats([
        entry({ type: "media-source", kind: "audio", audioLevel: 0.12 }),
        entry({ type: "outbound-rtp", kind: "audio", bytesSent: 4096 }),
      ]),
    ).toEqual({ level: 0.12, bytesSent: 4096 });
  });

  /* The report from a connection carrying video has a media-source for each,
     and taking the first would read the camera as a microphone. */
  it("ignores video sources and senders", () => {
    expect(
      readMicStats([
        entry({ type: "media-source", kind: "video", framesPerSecond: 30 }),
        entry({ type: "outbound-rtp", kind: "video", bytesSent: 999999 }),
        entry({ type: "media-source", kind: "audio", audioLevel: 0.2 }),
      ]),
    ).toEqual({ level: 0.2, bytesSent: null });
  });

  it("reads mediaType, which is what the older report calls it", () => {
    expect(
      readMicStats([entry({ type: "outbound-rtp", mediaType: "audio", bytesSent: 12 })]).bytesSent,
    ).toBe(12);
  });

  it("says null rather than zero when the report has nothing yet", () => {
    expect(readMicStats([])).toEqual({ level: null, bytesSent: null });
    expect(readMicStats(null)).toEqual({ level: null, bytesSent: null });
  });

  /* Null and zero are different answers: no sender yet, versus a sender that
     has sent nothing. The verdict below treats them differently. */
  it("keeps a zero level as zero", () => {
    expect(readMicStats([entry({ type: "media-source", kind: "audio", audioLevel: 0 })]).level).toBe(
      0,
    );
  });

  it("steps over junk without throwing", () => {
    expect(
      readMicStats([
        ["a", null],
        ["b", "not an object"],
        entry({ type: "media-source", kind: "audio", audioLevel: "loud" }),
      ]),
    ).toEqual({ level: null, bytesSent: null });
  });
});

describe("pushLevel", () => {
  it("starts full width so the row does not grow on first open", () => {
    expect(pushLevel([], 0.5)).toHaveLength(HISTORY);
  });

  it("keeps the newest at the end and drops the oldest", () => {
    const history = pushLevel(pushLevel([], 0.1), 0.2);
    expect(history).toHaveLength(HISTORY);
    expect(history[HISTORY - 1]).toBe(0.2);
    expect(history[HISTORY - 2]).toBe(0.1);
  });

  it("clamps, because audioLevel is documented as 0 to 1 and is not always", () => {
    expect(pushLevel([], 1.4).at(-1)).toBe(1);
    expect(pushLevel([], -0.2).at(-1)).toBe(0);
  });
});

describe("barHeight", () => {
  it("is silent at the floor and full at the ceiling", () => {
    expect(barHeight(0)).toBe(0);
    expect(barHeight(1)).toBe(1);
  });

  /* The reason it is not linear. Ordinary speech has to land somewhere a
     change in it is visible, not in the bottom twentieth. */
  it("puts ordinary speech in the middle rather than against the floor", () => {
    const speech = barHeight(0.05);
    expect(speech).toBeGreaterThan(0.4);
    expect(speech).toBeLessThan(0.8);
  });

  it("never goes below the floor for anything audible", () => {
    expect(barHeight(0.0000001)).toBe(0);
  });
});

describe("micVerdict", () => {
  const quiet = Array(HISTORY).fill(0);
  const speech = [...Array(HISTORY - 1).fill(0), 0.2];
  const base = { error: null, bytesSent: 2000, firstBytesSent: 1000, elapsedMs: 10_000 };

  it("reports the permission failure rather than guessing from silence", () => {
    const v = micVerdict({ ...base, history: quiet, error: "Permission denied" });
    expect(v.state).toBe("blocked");
    expect(v.message).toBe("Permission denied");
  });

  it("is patient before calling anything broken", () => {
    expect(micVerdict({ ...base, history: quiet, elapsedMs: 500 }).state).toBe("starting");
  });

  it("says it works when it hears something and the bytes climb", () => {
    expect(micVerdict({ ...base, history: speech }).state).toBe("working");
  });

  /** The one this screen was built for. */
  it("separates a working microphone from a working send", () => {
    const v = micVerdict({
      ...base,
      history: speech,
      bytesSent: 1000,
      firstBytesSent: 1000,
    });
    expect(v.state).toBe("not-sending");
    expect(v.message).toContain("sending rather than in capture");
  });

  it("does not call a sender that was already busy progress", () => {
    /* Opened on a connection that had already sent 90k. Without comparing
       against the first reading this reads as sending and hides the fault. */
    const v = micVerdict({
      ...base,
      history: speech,
      bytesSent: 90_000,
      firstBytesSent: 90_000,
    });
    expect(v.state).toBe("not-sending");
  });

  it("calls an open silent microphone silent", () => {
    expect(micVerdict({ ...base, history: quiet }).state).toBe("silent");
  });

  it("treats room noise under the floor as silence", () => {
    const room = Array(HISTORY).fill(SILENCE * 0.5);
    expect(micVerdict({ ...base, history: room }).state).toBe("silent");
  });

  it("waits for a sender rather than reporting one that does not exist yet", () => {
    const v = micVerdict({
      ...base,
      history: speech,
      bytesSent: null,
      firstBytesSent: null,
    });
    expect(v.state).toBe("not-sending");
  });
});
