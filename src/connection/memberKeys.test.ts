import { beforeEach, describe, expect, it, vi } from "vitest";

type Args = { members: { serverUserId: string }[] };
const evaluateMemberKeys = vi.fn(async ({ members }: Args) =>
  Object.fromEntries(members.map((m) => [m.serverUserId, { decision: { kind: "known" } }])),
);
let pins: Record<string, { thumbprint: string }> = {};

vi.mock("@gryt/crypto", () => ({
  asIdentityScope: (s: string) => s,
  evaluateMemberKeys: (args: Args) => evaluateMemberKeys(args),
  getPeerPin: (_: object, __: string, id: string) => pins[id] ?? null,
}));
vi.mock("../identity/dmKeys", () => ({ ownDmPublicKey: async () => null }));
vi.mock("../identity/personKey", () => ({ ownPersonPublicKey: async () => null }));
vi.mock("./pins", () => ({ dmScopeFor: async (host: string) => `srv:${host}` }));
vi.mock("./peerPins", () => ({ hydratePeerPins: async () => {}, peerPinStore: {} }));

const { evaluateMobileMemberKeys } = await import("./memberKeys");

const member = (id: string, dm = `dm-${id}`) => ({ serverUserId: id, dmKeyBinding: dm, personKeyBinding: `p-${id}` }) as never;
const checkedIds = () => evaluateMemberKeys.mock.calls.map(([a]) => a.members.map((m) => m.serverUserId));

describe("evaluateMobileMemberKeys", () => {
  beforeEach(() => {
    evaluateMemberKeys.mockClear();
    pins = {};
  });

  it("checks a resent list only for the members whose binding or pin moved", async () => {
    const base = { host: "a", myServerUserId: "1" };
    const states = await evaluateMobileMemberKeys({ ...base, members: [member("1"), member("2"), member("3")] });
    await evaluateMobileMemberKeys({ ...base, members: [member("1"), member("2"), member("3")] });
    await evaluateMobileMemberKeys({ ...base, members: [member("1"), member("2", "republished"), member("3")] });
    pins = { "3": { thumbprint: "t" } };
    const again = await evaluateMobileMemberKeys({ ...base, members: [member("1"), member("2", "republished"), member("3")] });
    expect(checkedIds()).toEqual([["1", "2", "3"], ["2"], ["3"]]);
    expect(Object.keys(again)).toEqual(Object.keys(states));
  });

  it("checks two lists arriving together once", async () => {
    await Promise.all([
      evaluateMobileMemberKeys({ host: "b", members: [member("1")], myServerUserId: "1" }),
      evaluateMobileMemberKeys({ host: "b", members: [member("1")], myServerUserId: "1" }),
    ]);
    expect(evaluateMemberKeys).toHaveBeenCalledTimes(1);
  });

  it("checks your own row again once the session says which it is", async () => {
    await evaluateMobileMemberKeys({ host: "c", members: [member("1"), member("2")], myServerUserId: null });
    await evaluateMobileMemberKeys({ host: "c", members: [member("1"), member("2")], myServerUserId: "1" });
    expect(checkedIds()).toEqual([["1", "2"], ["1"]]);
  });

  it("tries again after a check that failed", async () => {
    evaluateMemberKeys.mockRejectedValueOnce(new Error("no seed"));
    await expect(evaluateMobileMemberKeys({ host: "d", members: [member("1")], myServerUserId: null })).rejects.toThrow();
    await evaluateMobileMemberKeys({ host: "d", members: [member("1")], myServerUserId: null });
    expect(evaluateMemberKeys).toHaveBeenCalledTimes(2);
  });
});
