import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The store `@gryt/crypto` is handed on this platform (GRYT-732).
 *
 * The deciding is checked in that package, against a store held in a variable.
 * What is left here is the part that is this app's: a synchronous view over
 * something asynchronous, and the window between the two.
 *
 * `AsyncStorage` is stubbed rather than split away — the rest of this codebase
 * splits the pure half out and tests that, but here the storage *is* the
 * behaviour. A store that never writes, or that answers before it has read,
 * looks correct in every render and loses every pin on the next launch.
 */

const disk = new Map<string, string>();
let failNextWrite = false;
let failRead = false;

/** Set to hold `getItem` open, so the window before hydration can be driven. */
let releaseRead: (() => void) | null = null;
let reads = 0;

/**
 * How long each `setItem` takes, consumed in order.
 *
 * Descending by default, so a run of writes finishes in the reverse of the
 * order it was asked for. Anything that lets them interleave then lands the
 * wrong map, which a stub that resolves instantly cannot show.
 */
let writeDelays: number[] = [];

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    async getItem(key: string) {
      reads += 1;
      if (releaseRead) {
        await new Promise<void>((resolve) => {
          releaseRead = resolve;
        });
      }
      if (failRead) throw new Error("blocked");
      return disk.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      const delay = writeDelays.shift() ?? 0;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error("full");
      }
      disk.set(key, value);
    },
  },
}));

const { PEER_PINS_KEY } = await import("@gryt/crypto");
const {
  hydratePeerPins,
  peerPinStore,
  peerPinsReady,
  resetPeerPins,
} = await import("./peerPins");

const pin = (thumbprint: string) => ({
  thumbprint,
  dmPublicKey: `dm-${thumbprint}`,
  firstSeenAt: 1,
  lastSeenAt: 2,
});

/** Let queued writes run, including ones the stub is holding open. */
const settled = async () => {
  for (let i = 0; i < 12; i++) {
    await new Promise((resolve) => setTimeout(resolve, 4));
  }
};

beforeEach(() => {
  disk.clear();
  failNextWrite = false;
  failRead = false;
  releaseRead = null;
  writeDelays = [];
  reads = 0;
  resetPeerPins();
});

describe("hydration", () => {
  it("reads what a previous launch wrote", async () => {
    disk.set(PEER_PINS_KEY, JSON.stringify({ "srv:a bob": pin("t1") }));

    await hydratePeerPins();

    expect(peerPinStore.read()["srv:a bob"].thumbprint).toBe("t1");
  });

  it("answers empty before it has read, and says so", async () => {
    disk.set(PEER_PINS_KEY, JSON.stringify({ "srv:a bob": pin("t1") }));
    releaseRead = () => {};
    void hydratePeerPins();
    await settled();

    // The dangerous answer in the whole design: an empty map makes every peer
    // read as `first`, and pinning on `first` is what pinning exists to stop.
    // So nothing may pin on a decision taken before hydration resolves, and
    // this is the flag that lets a caller tell.
    expect(peerPinsReady()).toBe(false);
    expect(peerPinStore.read()).toEqual({});

    releaseRead?.();
    await settled();
    expect(peerPinsReady()).toBe(true);
    expect(peerPinStore.read()["srv:a bob"].thumbprint).toBe("t1");
  });

  it("reads once however many callers ask, while the first is still open", async () => {
    disk.set(PEER_PINS_KEY, JSON.stringify({ "srv:a bob": pin("t1") }));
    releaseRead = () => {};

    // Three callers before any of them has resolved. Without the in-flight
    // promise this starts three reads, and the last to finish puts its map over
    // whatever the others did — including over a pin written in between.
    const all = Promise.all([
      hydratePeerPins(),
      hydratePeerPins(),
      hydratePeerPins(),
    ]);
    await settled();
    expect(reads).toBe(1);

    releaseRead?.();
    await all;
    expect(peerPinsReady()).toBe(true);
    expect(peerPinStore.read()["srv:a bob"].thumbprint).toBe("t1");
  });

  it("does not read again once it has", async () => {
    await hydratePeerPins();
    peerPinStore.write({ "srv:a bob": pin("t2") });

    await hydratePeerPins();

    expect(reads).toBe(1);
    expect(peerPinStore.read()["srv:a bob"].thumbprint).toBe("t2");
  });

  it("treats unreadable storage as no pins rather than throwing", async () => {
    failRead = true;
    await hydratePeerPins();

    expect(peerPinStore.read()).toEqual({});
    expect(peerPinsReady()).toBe(true);
  });

  it("ignores stored junk", async () => {
    disk.set(PEER_PINS_KEY, "not json");
    await hydratePeerPins();
    expect(peerPinStore.read()).toEqual({});
  });
});

describe("writing", () => {
  it("is visible to the next read immediately, and reaches disk", async () => {
    await hydratePeerPins();

    peerPinStore.write({ "srv:a bob": pin("t1") });
    expect(peerPinStore.read()["srv:a bob"].thumbprint).toBe("t1");

    await settled();
    expect(JSON.parse(disk.get(PEER_PINS_KEY)!)["srv:a bob"].thumbprint).toBe("t1");
  });

  it("lands the last write, not the last one to finish", async () => {
    await hydratePeerPins();

    // A member list pins several people in a row and each write serialises the
    // whole map. Interleaved, whichever `setItem` happens to resolve last wins,
    // which is not the same as the last one asked for.
    // Descending, so left to themselves these finish 3, 2, 1 and the map that
    // reaches disk is the first one asked for rather than the last.
    writeDelays = [30, 20, 10];

    peerPinStore.write({ a: pin("1") });
    peerPinStore.write({ a: pin("1"), b: pin("2") });
    peerPinStore.write({ a: pin("1"), b: pin("2"), c: pin("3") });

    await settled();

    expect(Object.keys(JSON.parse(disk.get(PEER_PINS_KEY)!)).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("keeps the decision in memory when the write fails", async () => {
    await hydratePeerPins();
    failNextWrite = true;

    peerPinStore.write({ "srv:a bob": pin("t1") });
    await settled();

    // Losing the memory of a decision is survivable. Throwing out of a member
    // list is not.
    expect(peerPinStore.read()["srv:a bob"].thumbprint).toBe("t1");
    expect(disk.has(PEER_PINS_KEY)).toBe(false);
  });

  it("uses the key the package names, not one of its own", async () => {
    await hydratePeerPins();
    peerPinStore.write({ "srv:a bob": pin("t1") });
    await settled();

    // Two clients writing under two names is two apps that each think the other
    // has never pinned anybody.
    expect(PEER_PINS_KEY).toBe("peerDmKeyPins");
    expect([...disk.keys()]).toEqual([PEER_PINS_KEY]);
  });
});
