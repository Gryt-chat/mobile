import type { MlsOwnDevice } from "@gryt/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  adderMarkingKnown,
  addNotices,
  diffOwnDevices,
  newDeviceItemText,
  newDeviceToastText,
  noticeFor,
  type DeviceNotice,
} from "./newDeviceNotice";

const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void storage.set(k, v),
  },
}));
const { checkOwnDevices, holdDeviceNotices, markLinkedHere } = await import("./deviceNotices");

const device = (deviceId: string, over: Partial<MlsOwnDevice> = {}): MlsOwnDevice => ({
  serverUserId: "me",
  deviceId,
  name: null,
  addedAt: null,
  lastSeenAt: null,
  thisDevice: false,
  ...over,
});

describe("which of your devices are new (GRYT-1576)", () => {
  it("takes the first look as the baseline and says nothing", () => {
    expect(diffOwnDevices(null, [device("a", { thisDevice: true }), device("b")])).toEqual({ fresh: [], known: ["a", "b"] });
  });

  it("finds a device nobody knew, once", () => {
    const first = diffOwnDevices(["a", "b"], [device("a", { thisDevice: true }), device("b"), device("c")]);
    expect(first.fresh.map((d) => d.deviceId)).toEqual(["c"]);
    expect(diffOwnDevices(first.known, [device("a"), device("b"), device("c")]).fresh).toEqual([]);
  });

  it("never names this device, or one this phone linked itself", () => {
    const { fresh } = diffOwnDevices(["b"], [device("a", { thisDevice: true }), device("b"), device("n")], ["n"]);
    expect(fresh).toEqual([]);
  });

  it("words the toast and the Security line, with the device list's fallback name", () => {
    expect(newDeviceToastText("MacBook Air")).toBe("New device linked: MacBook Air. Not you? Remove it.");
    expect(newDeviceToastText(null)).toBe("New device linked: Another device. Not you? Remove it.");
    const notice = noticeFor("chat.example", "chat.example", device("c", { name: "Pixel 9", addedAt: "2026-09-29T10:00:00Z" }), 1);
    expect(notice.at).toBe(Date.parse("2026-09-29T10:00:00Z"));
    expect(newDeviceItemText(notice, () => "Sep 29, 12:00")).toBe("New device linked: Pixel 9, Sep 29, 12:00. Not you? Remove it.");
    expect(noticeFor("s", "h", device("d"), 42).at).toBe(42);
  });

  it("keeps one notice per device per server, newest first", () => {
    const n = (deviceId: string, at: number, scope = "s"): DeviceNotice => ({ scope, host: "h", deviceId, name: null, at });
    expect(addNotices([n("a", 1)], [n("a", 5), n("b", 3), n("a", 2, "other")]).map((x) => `${x.scope}/${x.deviceId}`)).toEqual([
      "s/b",
      "other/a",
      "s/a",
    ]);
  });

  it("marks a device known before core adds it, and passes positions through", async () => {
    const marked: [string, string[]][] = [];
    const calls: string[] = [];
    const adder = adderMarkingKnown(
      (host) =>
        host === "chat.example"
          ? {
              addOwnDevice: async (id) => {
                calls.push(`add ${id} after ${marked.length} marks`);
                return [];
              },
              groupPositions: async () => [{ conversationId: "c", groupId: "g", seq: 1, epoch: 1 }],
            }
          : undefined,
      (host) => `scope:${host}`,
      async (scope, ids) => void marked.push([scope, ids]),
    );
    expect(adder("elsewhere.example")).toBeUndefined();
    await adder("chat.example")!.addOwnDevice("dev-n");
    expect(marked).toEqual([["scope:chat.example", ["dev-n"]]]);
    expect(calls).toEqual(["add dev-n after 1 marks"]);
    expect(await adder("chat.example")!.groupPositions()).toHaveLength(1);
  });
});

describe("checking a server's devices", () => {
  beforeEach(() => storage.clear());

  it("baselines, then raises one notice for a new device and none for one this phone linked", async () => {
    const onNew = vi.fn();
    let list = [device("a", { thisDevice: true }), device("b")];
    const check = { scope: "s1", host: "chat.example", list: async () => list, onNew };

    await checkOwnDevices(check);
    expect(onNew).not.toHaveBeenCalled();

    await markLinkedHere("s1", ["mine"]);
    list = [...list, device("mine"), device("stranger", { name: "Unknown laptop" })];
    await checkOwnDevices(check);
    expect(onNew.mock.calls.map(([n]) => n.deviceId)).toEqual(["stranger"]);

    await checkOwnDevices(check);
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it("waits while this phone's own link is past Approve, then checks once it ends", async () => {
    const onNew = vi.fn();
    let list = [device("a", { thisDevice: true })];
    const check = { scope: "s2", host: "chat.example", list: async () => list, onNew };
    await checkOwnDevices(check);

    holdDeviceNotices(true);
    list = [...list, device("n")];
    await checkOwnDevices(check);
    expect(onNew).not.toHaveBeenCalled();
    await markLinkedHere("s2", ["n"]);

    holdDeviceNotices(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(onNew).not.toHaveBeenCalled();
    expect(JSON.parse(storage.get("gryt.pairing.knownDevices:s2")!)).toEqual(["a", "n"]);
  });
});
