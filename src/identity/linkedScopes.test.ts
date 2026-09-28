import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void storage.set(k, v),
  },
}));
vi.mock("../servers/address", () => ({ normalizeHost: (h: string) => h.trim().toLowerCase() }));

const { derivationScopeFor, resetLinkedScopes, writeLinkedScopes } = await import("./linkedScopes");

describe("where a linked phone derives its guest keys", () => {
  beforeEach(() => {
    storage.clear();
    resetLinkedScopes();
  });

  it("is the address until a link says otherwise", async () => {
    expect(await derivationScopeFor("Chat.Example")).toBe("Chat.Example");
  });

  it("is the scope the other device used, and survives a restart", async () => {
    await writeLinkedScopes([
      { host: "chat.example", scope: "srv:lineage-1" },
      { host: "plain.example", scope: "plain.example" },
    ]);
    expect(JSON.parse(storage.get("identity.linkedScopes")!)).toEqual({ "chat.example": "srv:lineage-1" });
    resetLinkedScopes();
    expect(await derivationScopeFor("Chat.Example")).toBe("srv:lineage-1");
    expect(await derivationScopeFor("plain.example")).toBe("plain.example");
  });

  it("reads a broken map as no map", async () => {
    storage.set("identity.linkedScopes", "[1,2]");
    expect(await derivationScopeFor("chat.example")).toBe("chat.example");
    resetLinkedScopes();
    storage.set("identity.linkedScopes", '{"chat.example": 5}');
    expect(await derivationScopeFor("chat.example")).toBe("chat.example");
  });

  it("a second link replaces the first one's scopes", async () => {
    await writeLinkedScopes([{ host: "chat.example", scope: "srv:a" }]);
    await writeLinkedScopes([{ host: "other.example", scope: "srv:b" }]);
    expect(await derivationScopeFor("chat.example")).toBe("chat.example");
    expect(await derivationScopeFor("other.example")).toBe("srv:b");
  });
});

describe("the guest identity a linked phone joins with", () => {
  it("is the one the other device has under the scope it sent", async () => {
    vi.doMock("./seed", () => ({ getOrCreateSeed: async () => Uint8Array.from({ length: 32 }, (_, i) => i + 3) }));
    const { getLocalIdentity } = await import("./localIdentity");
    const { deriveLocalKeyPair, subjectFor } = await import("./keys");
    const seed = Uint8Array.from({ length: 32 }, (_, i) => i + 3);

    expect((await getLocalIdentity("chat.example")).sub).toBe(subjectFor(deriveLocalKeyPair(seed, "chat.example").publicJwk));
    await writeLinkedScopes([{ host: "chat.example", scope: "srv:lineage-1" }]);
    expect((await getLocalIdentity("chat.example")).sub).toBe(subjectFor(deriveLocalKeyPair(seed, "srv:lineage-1").publicJwk));
  });
});
