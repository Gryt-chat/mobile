import { describe, expect, it, vi } from "vitest";

const disk = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    async getItem(key: string) {
      return disk.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      disk.set(key, value);
    },
  },
}));

const { applyUserGains } = await import("./userGains");
const volumes = await import("./userVolumes");

/** A stand-in for `react-native-webrtc`'s track, recording what `_setVolume` was handed. */
function track(id: string) {
  const calls: number[] = [];
  return { id, calls, _setVolume: (v: number) => calls.push(v) };
}

function stream(...tracks: ReturnType<typeof track>[]) {
  return { isLocal: false, stream: { getAudioTracks: () => tracks } };
}

const people: Record<string, string> = { "stream-a": "alice", "stream-b": "bob" };
const whoIs = (id: string) => people[id];

describe("applyUserGains", () => {
  it("hands each remote track its person's gain, as the desktop's volume / 100", () => {
    const a = track("a");
    const b = track("b");
    let audio = volumes.withVolume(volumes.parseUserAudio(null), "alice", 150);
    audio = volumes.withVolume(audio, "bob", 40);
    applyUserGains({ "stream-a": stream(a), "stream-b": stream(b) }, whoIs, audio, new Map());
    expect(a.calls).toEqual([1.5]);
    expect(b.calls).toEqual([0.4]);
  });

  it("sends zero for a local mute, and the slider's value back on unmute", () => {
    const a = track("a");
    const applied = new Map<string, number>();
    let audio = volumes.withVolume(volumes.parseUserAudio(null), "alice", 70);
    audio = volumes.withMuted(audio, "alice", true);
    applyUserGains({ "stream-a": stream(a) }, whoIs, audio, applied);
    audio = volumes.withMuted(audio, "alice", false);
    applyUserGains({ "stream-a": stream(a) }, whoIs, audio, applied);
    expect(a.calls).toEqual([0, 0.7]);
  });

  it("leaves a track at 100% alone, and only crosses the bridge on a change", () => {
    const a = track("a");
    const applied = new Map<string, number>();
    const flat = volumes.parseUserAudio(null);
    applyUserGains({ "stream-a": stream(a) }, whoIs, flat, applied);
    expect(a.calls).toEqual([]);
    const loud = volumes.withVolume(flat, "alice", 200);
    applyUserGains({ "stream-a": stream(a) }, whoIs, loud, applied);
    applyUserGains({ "stream-a": stream(a) }, whoIs, loud, applied);
    applyUserGains({ "stream-a": stream(a) }, whoIs, volumes.withoutVolume(loud, "alice"), applied);
    expect(a.calls).toEqual([2, 1]);
  });

  it("skips your own stream and anybody it can't name", () => {
    const mine = track("mine");
    const stranger = track("stranger");
    const audio = volumes.withVolume(volumes.parseUserAudio(null), "alice", 10);
    applyUserGains(
      { local: { isLocal: true, stream: { getAudioTracks: () => [mine] } }, "stream-x": stream(stranger) },
      whoIs,
      audio,
      new Map(),
    );
    expect(mine.calls).toEqual([]);
    expect(stranger.calls).toEqual([]);
  });

  it("sets a track that arrives after the volume was picked", () => {
    const applied = new Map<string, number>();
    const audio = volumes.withVolume(volumes.parseUserAudio(null), "alice", 50);
    applyUserGains({}, whoIs, audio, applied);
    const late = track("late");
    applyUserGains({ "stream-a": stream(late) }, whoIs, audio, applied);
    expect(late.calls).toEqual([0.5]);
  });

  it("forgets tracks that have gone", () => {
    const applied = new Map<string, number>();
    const audio = volumes.withVolume(volumes.parseUserAudio(null), "alice", 50);
    applyUserGains({ "stream-a": stream(track("a")) }, whoIs, audio, applied);
    applyUserGains({}, whoIs, audio, applied);
    expect(applied.size).toBe(0);
  });
});

describe("userVolumes", () => {
  it("keeps the desktop's range and steps", () => {
    expect(volumes.VOLUME_MIN).toBe(0);
    expect(volumes.VOLUME_MAX).toBe(200);
    expect(volumes.VOLUME_STEP).toBe(1);
    expect(volumes.clampVolume(250)).toBe(200);
    expect(volumes.clampVolume(-5)).toBe(0);
    expect(volumes.clampVolume(42.6)).toBe(43);
  });

  it("reads back only what it could have written", () => {
    const parsed = volumes.parseUserAudio({
      volumes: { alice: 120, bob: "loud", carol: 900 },
      muted: { alice: true, bob: 1 },
    });
    expect(parsed).toEqual({ volumes: { alice: 120, carol: 200 }, muted: { alice: true } });
    expect(volumes.parseUserAudio("junk")).toEqual({ volumes: {}, muted: {} });
  });

  it("persists per server user id once a drag settles", async () => {
    vi.useFakeTimers();
    await volumes.userVolumesLoaded;
    volumes.setUserVolume("alice", 80);
    volumes.setUserVolume("alice", 90);
    volumes.setUserMuted("bob", true);
    expect(disk.has("gryt:userVolumes")).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(JSON.parse(disk.get("gryt:userVolumes") ?? "{}")).toEqual({
      volumes: { alice: 90 },
      muted: { bob: true },
    });
    volumes.resetUserVolume("alice");
    await vi.advanceTimersByTimeAsync(300);
    expect(JSON.parse(disk.get("gryt:userVolumes") ?? "{}").volumes).toEqual({});
    vi.useRealTimers();
  });
});
