import { asIdentityScope, evaluateMemberKeys, type PeerKeyDecision } from "@gryt/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void storage.set(k, v),
    removeItem: async (k: string) => void storage.delete(k),
  },
}));
const SCOPE = "srv:key-change";
vi.mock("./pins", () => ({ dmScopeFor: async () => SCOPE }));
let seed = Uint8Array.from({ length: 32 }, (_, i) => i * 3 + 1);
vi.mock("../identity/seed", () => ({ getOrCreateSeed: async () => seed }));

const { dmKeyBindingFor } = await import("../identity/dmKeys");
const { peerPinStore, resetPeerPins } = await import("./peerPins");
const { isNotThem, newKeyCode, setNotThem, trustNewKey, undoTrust } = await import("./keyChange");

const decide = async (binding: string): Promise<PeerKeyDecision> =>
  (
    await evaluateMemberKeys({
      store: peerPinStore,
      scope: asIdentityScope(SCOPE),
      ownKey: null,
      members: [{ serverUserId: "sable", dmKeyBinding: binding }],
      myServerUserId: "me",
    })
  ).sable.decision;

describe("confirming a changed key", () => {
  beforeEach(() => {
    storage.clear();
    resetPeerPins();
  });

  it("trusts the new key, and undo brings the question back", async () => {
    const old = await dmKeyBindingFor(SCOPE);
    seed = Uint8Array.from({ length: 32 }, (_, i) => i * 5 + 2);
    const fresh = await dmKeyBindingFor(SCOPE);
    expect((await decide(old)).kind).toBe("first");

    const changed = await decide(fresh);
    if (changed.kind !== "changed") throw new Error(`expected changed, got ${changed.kind}`);
    expect(await newKeyCode("chat.example", changed)).toMatch(/\S/);

    const previous = await trustNewKey("chat.example", "sable", changed);
    expect((await decide(fresh)).kind).toBe("known");

    await undoTrust("chat.example", "sable", previous);
    expect((await decide(fresh)).kind).toBe("changed");
  });

  it("remembers 'it's not them' for that key until Check again", async () => {
    const old = await dmKeyBindingFor(SCOPE);
    seed = Uint8Array.from({ length: 32 }, (_, i) => i * 7 + 3);
    const fresh = await dmKeyBindingFor(SCOPE);
    await decide(old);
    const changed = await decide(fresh);
    if (changed.kind !== "changed") throw new Error("expected changed");

    await setNotThem("chat.example", "sable", changed, true);
    expect(await isNotThem("chat.example", "sable", changed)).toBe(true);
    await setNotThem("chat.example", "sable", changed, false);
    expect(await isNotThem("chat.example", "sable", changed)).toBe(false);
  });
});
