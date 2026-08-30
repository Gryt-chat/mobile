import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The lineage a DM key is derived under (GRYT-732).
 *
 * `identityScopeFor` is the address on this platform and is staying the address
 * until GRYT-517 — a guest identity has roles and a history filed under it, and
 * rederiving would arrive at every server already joined as a stranger. A DM key
 * has neither: it comes from the seed on demand, and naming it better costs a
 * republished binding.
 *
 * So DM keys start where the desktop already is. The string has to match the
 * desktop's character for character, because it is the same person's key on both
 * — a phone and a laptop holding one seed derive one DM key for one server.
 */

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

const { dmScopeFor, forgetPin, getPin, savePin } = await import("./pins");

const jwk = { kty: "EC", crv: "P-256", x: "x", y: "y" } as const;

beforeEach(() => {
  disk.clear();
});

describe("dmScopeFor", () => {
  it("is the lineage, prefixed the way the desktop prefixes it", async () => {
    await savePin("gryt.test:5001", {
      keyId: "abc123",
      jwk,
      host: "gryt.test:5001",
      pinnedAt: 1,
    });

    expect(await dmScopeFor("gryt.test:5001")).toBe("srv:abc123");
  });

  it("falls back to the address when nothing is pinned", async () => {
    // A server that offered no proof. There is no lineage to name, and the
    // desktop lands on the address for the same reason.
    expect(await dmScopeFor("gryt.test:5001")).toBe("gryt.test:5001");
  });

  it("is not the address once a pin exists", async () => {
    // The failure this rules out is silent: deriving under the address works
    // perfectly until the server changes port, and then every message already
    // encrypted to the old key is unreadable with nothing saying why.
    await savePin("gryt.test:5001", {
      keyId: "abc123",
      jwk,
      host: "gryt.test:5001",
      pinnedAt: 1,
    });

    expect(await dmScopeFor("gryt.test:5001")).not.toBe("gryt.test:5001");
  });

  it("gives two servers two scopes", async () => {
    await savePin("a.test", { keyId: "k1", jwk, host: "a.test", pinnedAt: 1 });
    await savePin("b.test", { keyId: "k2", jwk, host: "b.test", pinnedAt: 1 });

    expect(await dmScopeFor("a.test")).toBe("srv:k1");
    expect(await dmScopeFor("b.test")).toBe("srv:k2");
  });
});

describe("originKeyId", () => {
  it("is written on a first pin", async () => {
    await savePin("gryt.test", { keyId: "k1", jwk, host: "gryt.test", pinnedAt: 1 });

    expect((await getPin("gryt.test"))?.originKeyId).toBe("k1");
  });

  it("is kept when the same address is pinned again", async () => {
    await savePin("gryt.test", { keyId: "k1", jwk, host: "gryt.test", pinnedAt: 1 });
    await savePin("gryt.test", { keyId: "k2", jwk, host: "gryt.test", pinnedAt: 2 });

    // Nothing does this today — a rotated server is refused rather than
    // accepted. This is the line that will keep a DM key working across a
    // rotation when that path lands, and it is cheaper to have written the
    // lineage from the start than to migrate pins that never recorded one.
    expect((await getPin("gryt.test"))?.originKeyId).toBe("k1");
    expect((await getPin("gryt.test"))?.keyId).toBe("k2");
    expect(await dmScopeFor("gryt.test")).toBe("srv:k1");
  });

  it("starts again after the server is forgotten", async () => {
    await savePin("gryt.test", { keyId: "k1", jwk, host: "gryt.test", pinnedAt: 1 });
    await forgetPin("gryt.test");
    await savePin("gryt.test", { keyId: "k2", jwk, host: "gryt.test", pinnedAt: 2 });

    // Forgetting a server is a deliberate act and means starting over. A
    // lineage that survived it would tie a fresh trust-on-first-use to a key
    // somebody chose to stop trusting.
    expect((await getPin("gryt.test"))?.originKeyId).toBe("k2");
  });

  it("reads a pin written before the field existed", async () => {
    disk.set(
      "serverPins",
      JSON.stringify({
        "gryt.test": { keyId: "k1", jwk, host: "gryt.test", pinnedAt: 1 },
      }),
    );

    // Every pin on a device that upgrades is this shape, and they are all the
    // same string either way: nothing has ever rotated.
    expect(await dmScopeFor("gryt.test")).toBe("srv:k1");
  });
});
