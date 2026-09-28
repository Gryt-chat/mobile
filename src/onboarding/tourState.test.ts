import { beforeEach, describe, expect, it, vi } from "vitest";

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

const {
  getTourSeen,
  setTourSeen,
  isTourVisible,
  startTour,
  hideTour,
  finishTour,
  resetTour,
  initJoinWatcher,
  noteServerCount,
  consumePendingJoin,
} = await import("./tourState");

beforeEach(() => {
  disk.clear();
  hideTour();
});

describe("the seen flag", () => {
  it("is unseen until something writes it", async () => {
    expect(await getTourSeen()).toBe(false);
  });

  it("stays seen across a reload", async () => {
    await setTourSeen(true);
    expect(await getTourSeen()).toBe(true);
  });
});

describe("visibility", () => {
  it("opens and closes", () => {
    expect(isTourVisible()).toBe(false);
    startTour();
    expect(isTourVisible()).toBe(true);
    hideTour();
    expect(isTourVisible()).toBe(false);
  });

  it("finishing closes it and records it seen, same as skipping", async () => {
    startTour();
    finishTour();
    expect(isTourVisible()).toBe(false);
    expect(await getTourSeen()).toBe(true);
  });

  it("resetting un-sees it and opens it right away", async () => {
    await setTourSeen(true);
    resetTour();
    expect(isTourVisible()).toBe(true);
    expect(await getTourSeen()).toBe(false);
  });
});

describe("the join watcher", () => {
  it("does nothing on a server count that was never zero", () => {
    const watcher = noteServerCount(initJoinWatcher(1), 1);
    expect(consumePendingJoin(watcher, false).start).toBe(false);
  });

  it("fires once the flag says unseen, on a zero-to-one move", () => {
    let watcher = initJoinWatcher(0);
    watcher = noteServerCount(watcher, 1);
    const result = consumePendingJoin(watcher, false);
    expect(result.start).toBe(true);
    // Consumed: asking again does not fire a second time.
    expect(consumePendingJoin(result.watcher, false).start).toBe(false);
  });

  it("holds the join open until the flag has actually loaded", () => {
    let watcher = initJoinWatcher(0);
    watcher = noteServerCount(watcher, 1);
    // Storage has not answered yet — nothing fires on a guess.
    const stillLoading = consumePendingJoin(watcher, null);
    expect(stillLoading.start).toBe(false);
    // It answers false a render later, and the join is still there to catch.
    expect(consumePendingJoin(stillLoading.watcher, false).start).toBe(true);
  });

  it("never fires once the flag says the tour has already been seen", () => {
    let watcher = initJoinWatcher(0);
    watcher = noteServerCount(watcher, 1);
    expect(consumePendingJoin(watcher, true).start).toBe(false);
  });
});
