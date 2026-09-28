import type { MlsServerCapability } from "@gryt/core";
import { describe, expect, it } from "vitest";

import { canRetryLocalHistory, localHistoryProblemText } from "./localHistoryCopy";
import { ARCHIVE_CLOSED, createModeOnlySource } from "./modeOnly";
import { retireOldDevices } from "./retireDevices";
import { dmComposer } from "./timeline";

/* A DM while this phone's archive won't open: what may still send, what waits, and the
 * old devices a clear leaves on the server. */

const MLS: MlsServerCapability = { version: 1, ciphersuites: [1], retentionDays: 30 };

function fakeSocket(devices: { serverUserId: string; deviceId: string }[] = []) {
  const sent: string[] = [];
  return {
    sent,
    emit(event: string, _payload: unknown, ack: (r: unknown) => void) {
      sent.push(event);
      queueMicrotask(() => ack(event === "mls:devices" ? { ok: true, devices } : { ok: false, error: "nope", message: "no" }));
    },
  };
}

function seenStore(initial: string[] = []) {
  const seen = new Set(initial);
  return { has: async (id: string) => seen.has(id), add: async (id: string) => void seen.add(id) };
}

function modeOnly(capability: MlsServerCapability | null, socket = fakeSocket(), seen = seenStore()) {
  return createModeOnlySource({
    socket,
    storeScope: "srv:a",
    dmScope: "srv:a",
    serverUserId: "me",
    capability,
    getAccessToken: async () => "token",
    seen,
  });
}

describe("the mode-only source", () => {
  it("sends over version 1 on a server without MLS, and asks the server nothing", async () => {
    const socket = fakeSocket();
    const source = modeOnly(null, socket);
    expect(await source.modeFor("dm_1", "bob")).toEqual({ kind: "sealed-v1", reason: "server_without_mls" });
    expect(socket.sent).toEqual([]);
    expect(source.problems("dm_1")).toEqual({ undecryptable: 0, lost: null });
  });

  it("still says so when a server dropped MLS for somebody seen on it", async () => {
    const source = modeOnly(null, fakeSocket(), seenStore(["bob"]));
    expect(await source.modeFor("dm_1", "bob")).toEqual({ kind: "refused", reason: "server_dropped_mls" });
  });

  it("with MLS on, lets version 1 go to a peer without devices, and holds a peer with them", async () => {
    const without = fakeSocket([]);
    expect((await modeOnly(MLS, without).modeFor("dm_1", "bob")).kind).toBe("sealed-v1");
    expect(without.sent).toEqual(["mls:devices"]);

    const withDevices = fakeSocket([{ serverUserId: "bob", deviceId: "b1" }]);
    const source = modeOnly(MLS, withDevices);
    await expect(source.modeFor("dm_1", "bob")).rejects.toMatchObject({ code: ARCHIVE_CLOSED });
    expect(withDevices.sent).toEqual(["mls:devices"]);
    await expect(source.send("dm_1", "bob", { type: "message", id: "m", text: "hi" })).rejects.toMatchObject({
      code: ARCHIVE_CLOSED,
    });
  });
});

describe("dmComposer", () => {
  it("never holds a channel", () => {
    expect(dmComposer({ dmPeer: null, mode: null, waiting: false, archiveFailed: true })).toEqual({
      path: "server",
      held: false,
      archiveProblem: false,
    });
  });

  it("sends version 1 over the server path, with no archive problem, while the archive is shut", () => {
    const mode = { kind: "sealed-v1", reason: "server_without_mls" } as const;
    expect(dmComposer({ dmPeer: "bob", mode, waiting: false, archiveFailed: true })).toEqual({
      path: "server",
      held: false,
      archiveProblem: false,
    });
  });

  it("holds while waiting or refused, and only then shows the archive problem", () => {
    expect(dmComposer({ dmPeer: "bob", mode: null, waiting: true, archiveFailed: true })).toEqual({
      path: "none",
      held: true,
      archiveProblem: true,
    });
    const refused = { kind: "refused", reason: "no_own_device" } as const;
    expect(dmComposer({ dmPeer: "bob", mode: refused, waiting: false, archiveFailed: false })).toMatchObject({
      held: true,
      archiveProblem: false,
    });
    expect(dmComposer({ dmPeer: "bob", mode: { kind: "mls" }, waiting: false, archiveFailed: false })).toEqual({
      path: "mls",
      held: false,
      archiveProblem: false,
    });
  });
});

describe("the archive problem's words", () => {
  it("offers Try again only where asking the keychain again could help", () => {
    expect(canRetryLocalHistory("unseal-failed")).toBe(true);
    expect(canRetryLocalHistory(null)).toBe(true);
    expect(canRetryLocalHistory("mismatch")).toBe(false);
    expect(canRetryLocalHistory("damaged")).toBe(false);
    expect(localHistoryProblemText("mismatch")).toMatch(/doesn't match/);
  });
});

/** Retired ids, and what the server says to each removal. */
function retiring(retired: string[], answers: Record<string, "ok" | string>, current: string | null = null) {
  const left = [...retired];
  const asked: string[] = [];
  const session = {
    storeScope: "srv:a",
    async removeOwnDevice(deviceId: string) {
      asked.push(deviceId);
      const answer = answers[deviceId] ?? "ok";
      if (answer === "ok") return;
      throw Object.assign(new Error(answer), { code: "refused", refusal: { ok: false, error: answer, message: answer } });
    },
  };
  const archive = {
    retiredMlsDevices: async (scope: string) => (scope === "srv:a" ? [...left] : []),
    forgetRetiredMlsDevice: async (_scope: string, deviceId: string) => void left.splice(left.indexOf(deviceId), 1),
    mlsState: () => ({ loadDevice: async () => (current ? { deviceId: current } : null) }),
  };
  return { session, archive: archive as unknown as Parameters<typeof retireOldDevices>[1], asked, left };
}

describe("retireOldDevices", () => {
  it("removes each old device and forgets it once the server has", async () => {
    const r = retiring(["d1", "d2"], {});
    await retireOldDevices(r.session, r.archive);
    expect(r.asked).toEqual(["d1", "d2"]);
    expect(r.left).toEqual([]);
  });

  it("counts a device the server never had as gone, and keeps one that failed for the next connect", async () => {
    const r = retiring(["d1", "d2", "d3"], { d1: "unknown_device", d2: "timeout", d3: "invalid_device" });
    await retireOldDevices(r.session, r.archive);
    expect(r.asked).toEqual(["d1", "d2", "d3"]);
    expect(r.left).toEqual(["d2"]);
  });

  it("never removes the device this phone is using now", async () => {
    const r = retiring(["d1", "now"], {}, "now");
    await retireOldDevices(r.session, r.archive);
    expect(r.asked).toEqual(["d1"]);
    expect(r.left).toEqual([]);
  });
});
