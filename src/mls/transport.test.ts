import { describe, expect, it, vi } from "vitest";

import { readMlsCapability } from "./capability";
import { asBytes, socketMlsTransport } from "./transport";


/** Answers each event with whatever `reply` returns, and records what was sent. */
function fakeSocket(reply: (event: string, payload: Record<string, unknown>) => unknown) {
  const sent: { event: string; payload: Record<string, unknown> }[] = [];
  return {
    sent,
    emit(event: string, payload: Record<string, unknown>, ack: (r: unknown) => void) {
      sent.push({ event, payload });
      const r = reply(event, payload);
      if (r !== undefined) queueMicrotask(() => ack(r));
    },
  };
}

const token = async () => "token-1";

describe("socketMlsTransport", () => {
  it("adds the access token and turns binary back into Uint8Arrays", async () => {
    const socket = fakeSocket((event) =>
      event === "mls:log:fetch"
        ? {
            ok: true,
            group: null,
            entries: [{ seq: 1, data: new Uint8Array([1, 2]).buffer }],
            nextCursor: 1,
            hasMore: false,
            gap: false,
          }
        : { ok: true, welcomes: [{ welcomeId: "w", data: Buffer.from([3]) }], groups: [], registered: true, keyPackages: {} },
    );
    const t = socketMlsTransport({ socket, getAccessToken: token });

    const log = await t.fetchLog({ conversationId: "dm_1", after: 0 });
    const sync = await t.sync({ deviceId: "d" });

    expect(socket.sent[0]).toEqual({ event: "mls:log:fetch", payload: { accessToken: "token-1", conversationId: "dm_1", after: 0 } });
    expect(log.ok && log.entries[0].data).toEqual(new Uint8Array([1, 2]));
    expect(sync.ok && sync.welcomes[0].data).toBeInstanceOf(Uint8Array);
  });

  it("refuses without asking when there is no token, and times out a silent server", async () => {
    const socket = fakeSocket(() => undefined);
    const none = socketMlsTransport({ socket, getAccessToken: async () => null });
    expect(await none.listDevices({})).toMatchObject({ ok: false, error: "unauthenticated" });
    expect(socket.sent).toHaveLength(0);

    const silent = socketMlsTransport({ socket, getAccessToken: token, timeoutMs: 5 });
    expect(await silent.listDevices({})).toMatchObject({ ok: false, error: "timeout" });
  });

  it("says placeholder: false only for sends that aren't messages (GRYT-1517)", async () => {
    const socket = fakeSocket(() => ({ ok: true, seq: 4 }));
    let placeholder = true;
    const t = socketMlsTransport({ socket, getAccessToken: token, placeholderFor: () => placeholder });
    const req = { conversationId: "dm_1", deviceId: "d", message: new Uint8Array([9]) };

    await t.send(req);
    placeholder = false;
    await t.send(req);

    expect(socket.sent[0].payload).not.toHaveProperty("placeholder");
    expect(socket.sent[1].payload.placeholder).toBe(false);
  });

  it("forwards the uploads a message carries, and says nothing when there are none (GRYT-1523)", async () => {
    const socket = fakeSocket(() => ({ ok: true, seq: 5 }));
    const t = socketMlsTransport({ socket, getAccessToken: token });
    const req = { conversationId: "dm_1", deviceId: "d", message: new Uint8Array([9]) };

    await t.send({ ...req, attachmentIds: ["file_a", "file_b"] });
    await t.send({ ...req, attachmentIds: [] });

    expect(socket.sent[0].payload.attachmentIds).toEqual(["file_a", "file_b"]);
    expect(socket.sent[1].payload).not.toHaveProperty("attachmentIds");
  });

  it("makes KeyPackages again on the server's clock once, after an out-of-date refusal", async () => {
    let calls = 0;
    const socket = fakeSocket(() =>
      ++calls === 1
        ? { ok: false, error: "key_package_not_yet_valid", message: "fast clock", serverTime: 1_800_000_000 }
        : { ok: true, stored: 1, unclaimed: 1, lastResort: true },
    );
    const remake = vi.fn(async () => ({ deviceId: "d", keyPackages: [new Uint8Array([7])] }));
    const t = socketMlsTransport({ socket, getAccessToken: token, remake });

    const r = await t.publishKeyPackages({ deviceId: "d", keyPackages: [new Uint8Array([1])] });

    expect(r.ok).toBe(true);
    expect(remake).toHaveBeenCalledWith(expect.anything(), 1_800_000_000);
    expect(socket.sent[1].payload.keyPackages).toEqual([new Uint8Array([7])]);
  });

  it("hands back a refusal with no serverTime untouched", async () => {
    const socket = fakeSocket(() => ({ ok: false, error: "too_many_devices", message: "five" }));
    const remake = vi.fn();
    const t = socketMlsTransport({ socket, getAccessToken: token, remake });
    expect(await t.publishKeyPackages({ deviceId: "d", keyPackages: [] })).toMatchObject({ error: "too_many_devices" });
    expect(remake).not.toHaveBeenCalled();
  });

  it("reads a Uint8Array view without copying the wrong bytes", () => {
    const whole = new Uint8Array([0, 1, 2, 3]);
    expect(asBytes(whole.subarray(1, 3))).toEqual(new Uint8Array([1, 2]));
    expect(() => asBytes("nope")).toThrow();
  });
});

describe("readMlsCapability", () => {
  it("takes version 1 with suite 1 and nothing else", () => {
    expect(readMlsCapability({ version: 1, ciphersuites: [1], retentionDays: 14 })).toEqual({
      version: 1,
      ciphersuites: [1],
      retentionDays: 14,
    });
    expect(readMlsCapability({ version: 2, ciphersuites: [1] })).toBeNull();
    expect(readMlsCapability({ version: 1, ciphersuites: [3] })).toBeNull();
    expect(readMlsCapability(undefined)).toBeNull();
  });
});
