import { describe, expect, it } from "vitest";

import { formatSample, readCallSample } from "./callRecorder";

const report = (stats: Record<string, unknown>[]) => new Map(stats.map((s, i) => [String(i), s]));

describe("readCallSample", () => {
  it("reads only the audio, summing what arrives from everyone", () => {
    const sample = readCallSample(
      report([
        { type: "outbound-rtp", kind: "audio", packetsSent: 500 },
        { type: "outbound-rtp", kind: "video", packetsSent: 9000 },
        { type: "media-source", kind: "audio", audioLevel: 0.2 },
        { type: "inbound-rtp", kind: "audio", packetsReceived: 300, audioLevel: 0.1, concealedSamples: 10 },
        { type: "inbound-rtp", kind: "audio", packetsReceived: 200, audioLevel: 0.4, concealedSamples: 5 },
        { type: "inbound-rtp", kind: "video", packetsReceived: 7000 },
        { type: "candidate-pair", state: "succeeded", nominated: true, currentRoundTripTime: 0.042 },
      ]),
    );
    expect(sample).toEqual({ outPackets: 500, outLevel: 0.2, inPackets: 500, inLevel: 0.4, inConcealed: 15, rttMs: 42 });
  });

  it("says unknown, not zero, when a field is missing", () => {
    expect(readCallSample(report([])).outPackets).toBeNull();
  });
});

describe("formatSample", () => {
  const base = { outPackets: 100, outLevel: 0.1, inPackets: 100, inLevel: 0.05, inConcealed: 0, rttMs: 30 };

  it("shows what moved in the last second, so a stop reads as +0", () => {
    const line = formatSample(5, { ...base, outPackets: 150, inPackets: 100 }, base, null);
    expect(line).toBe("+5s | out +50pk mic 0.10 | in +0pk lvl 0.05 hid +0 | rtt 30ms");
  });

  it("adds what the iOS audio session says", () => {
    const line = formatSample(2, base, null, {
      category: "AVAudioSessionCategoryPlayAndRecord",
      mode: "AVAudioSessionModeVoiceChat",
      outputs: ["Speaker"],
      webRTCActive: false,
    });
    expect(line).toContain("ios PlayAndRecord/VoiceChat Speaker webrtc-off");
  });
});
