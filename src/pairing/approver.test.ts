import {
  createNewDevicePairing,
  createPairingRelay,
  type HistoryArchive,
  type NewDeviceState,
  type PairingTokens,
} from "@gryt/core";
import { formatPairingQr, type HistoryRecord, type PairingEnvelope } from "@gryt/crypto";
import { describe, expect, it } from "vitest";

import { createPhoneApprover, endReasonOf, type OwnerCheck, type PhoneApprover } from "./approver";
import { buildEnvelope } from "./envelope";
import { FakeClock, FakeKeycloak, FakeRelay } from "./relay.fake";

const SEED = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

/** A's archive: records by conversation, paged newest first the way the SQLite one is. */
function memoryArchive(records: HistoryRecord[]): HistoryArchive {
  return {
    async conversations() {
      const counts = new Map<string, { scope: string; conversationId: string; count: number }>();
      for (const r of records) {
        const key = `${r.scope} ${r.conversationId}`;
        const c = counts.get(key) ?? { scope: r.scope, conversationId: r.conversationId, count: 0 };
        c.count++;
        counts.set(key, c);
      }
      return [...counts.values()];
    },
    async page(scope, conversationId, { before, limit }) {
      return records
        .filter((r) => r.scope === scope && r.conversationId === conversationId)
        .filter((r) => !before || r.sentAt < before.sentAt || (r.sentAt === before.sentAt && r.messageId < before.messageId))
        .sort((a, b) => b.sentAt - a.sentAt || (a.messageId < b.messageId ? 1 : -1))
        .slice(0, limit);
    },
  };
}

function setup(
  opts: { owner?: OwnerCheck[]; signedIn?: boolean; token?: () => string | null; history?: HistoryRecord[] } = {},
) {
  const clock = new FakeClock();
  const relay = new FakeRelay(clock);
  const keycloak = new FakeKeycloak();
  const committed: { envelope: PairingEnvelope; tokens: PairingTokens | null }[] = [];
  const adds: { host: string; deviceId: string }[] = [];
  const owner = [...(opts.owner ?? ["ok"])];
  let refreshes = 0;

  const envelope = () =>
    buildEnvelope({
      seed: SEED,
      keys: [],
      account: opts.signedIn
        ? { issuer: keycloak.issuer, clientId: "gryt-web", identityUrl: relay.origin, sub: "user-1", username: "sivert" }
        : null,
      servers: [{ host: "chat.example", name: "Example", nickname: "siv", scheme: "https" }],
      scopeFor: (host) => host,
      pins: {},
      seenOnMls: {},
      from: "iPhone",
    });

  const received: HistoryRecord[] = [];
  const n = createNewDevicePairing({
    relay: createPairingRelay(relay.origin, relay.fetch),
    device: { name: "MacBook Air", app: "Gryt desktop", platform: "macOS" },
    storage: { commit: async (e, tokens) => void committed.push({ envelope: e, tokens }) },
    oidc: keycloak.oidc,
    clock,
    history: { put: async (records) => void received.push(...records) },
  });
  const a = createPhoneApprover({
    relay: createPairingRelay(relay.origin, relay.fetch),
    relayOrigin: relay.origin,
    fetch: keycloak.fetch,
    clock,
    devices: (host) =>
      host === "chat.example"
        ? {
            addOwnDevice: async (deviceId, o) => {
              adds.push({ host, deviceId });
              const result = { conversationId: "dm-1", groupId: "ab", outcome: "added" as const, add: { seq: 4, epoch: 2 } };
              o?.onProgress?.({ done: 1, total: 1, result });
              return [result];
            },
            groupPositions: async () => [{ conversationId: "dm-1", groupId: "ab", seq: 3, epoch: 1 }],
          }
        : undefined,
    confirmOwner: async () => owner.shift() ?? "ok",
    collectEnvelope: async () => envelope(),
    refreshAccessToken: async () => {
      refreshes++;
      return opts.token ? opts.token() : "token:user-1";
    },
    history: opts.history ? memoryArchive(opts.history) : undefined,
    lateWindowMs: 1000,
  });

  async function until(done: () => boolean, maxSeconds = 600) {
    for (let s = 0; ; s++) {
      for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
      if (done()) return;
      if (s >= maxSeconds) throw new Error("never got there");
      clock.advance(1000);
    }
  }

  async function toEmoji() {
    n.start();
    await until(() => n.state.phase === "showing");
    const { qr } = n.state as Extract<NewDeviceState, { phase: "showing" }>;
    a.claim({ qr });
    await until(() => a.state.pairing.phase === "confirming");
    return qr;
  }

  return { clock, relay, keycloak, committed, adds, received, n, a, until, toEmoji, refreshes: () => refreshes };
}

const phase = (a: PhoneApprover) => a.state.pairing.phase;

describe("the phone approving a new device", () => {
  it("links a guest: seed and servers across, then adds it to every DM", async () => {
    const env = setup();
    await env.toEmoji();
    const confirming = env.a.state.pairing as Extract<PhoneApprover["state"]["pairing"], { phase: "confirming" }>;
    expect(confirming.device.name).toBe("MacBook Air");
    expect(confirming.location).toBe("Oslo, Norway");
    expect(confirming.emoji).toEqual((env.n.state as { emoji: unknown }).emoji);

    await env.a.approve();
    await env.until(() => env.n.state.phase === "joining");
    expect(env.committed[0].envelope.seed).toEqual(SEED);
    expect(env.committed[0].envelope.servers).toEqual([
      { host: "chat.example", name: "Example", scope: "chat.example", nickname: "siv", scheme: "https" },
    ]);
    expect(env.committed[0].envelope.from).toBe("iPhone");
    expect(env.committed[0].tokens).toBeNull();
    expect(env.refreshes()).toBe(0);

    await env.n.ready([
      { host: "chat.example", deviceId: "dev-n" },
      { host: "not-connected.example", deviceId: "dev-x" },
    ]);
    await env.until(() => phase(env.a) === "done");
    expect(env.adds).toEqual([{ host: "chat.example", deviceId: "dev-n" }]);
  });

  it("sends the archive's history, and a message archived after the snapshot, then says how much went", async () => {
    const record = (i: number): HistoryRecord => ({
      scope: "chat.example",
      conversationId: "dm-1",
      messageId: `m${i}`,
      sentAt: 1_700_000_000_000 + i,
      message: { senderId: "user-1", text: `hello ${i}`, attachments: {} },
    });
    const env = setup({ history: [1, 2, 3].map(record) });
    await env.toEmoji();
    await env.a.approve();
    await env.until(() => env.n.state.phase === "joining");
    expect(env.committed[0].envelope.history?.manifest.chunks.length).toBeGreaterThan(0);
    expect(env.a.state.history).not.toBeNull();

    // Sent after the snapshot's position (seq 3) and before N's add (seq 4): only the tail has it.
    env.a.noteMessage({ host: "chat.example", conversationId: "dm-1", seq: 4, epoch: 1, record: record(4) });
    await env.n.ready([{ host: "chat.example", deviceId: "dev-n" }]);
    await env.until(() => phase(env.a) === "sending" || phase(env.a) === "done");
    await env.until(() => phase(env.a) === "done" && env.n.state.phase === "done");

    expect(env.received.map((r) => r.messageId).sort()).toEqual(["m1", "m2", "m3", "m4"]);
    expect(env.received.find((r) => r.messageId === "m2")?.message).toEqual(record(2).message);
    expect(env.a.state.history?.messages).toBe(4);
    expect(env.a.state.history?.complete).toBe(true);
  });

  it("signs an account in through the extension with a token refreshed for it", async () => {
    const env = setup({ signedIn: true });
    await env.toEmoji();
    await env.a.approve();
    await env.until(() => env.n.state.phase === "joining");
    expect(env.committed[0].envelope.account?.sub).toBe("user-1");
    expect(env.committed[0].tokens?.accessToken).toBe("token:user-1");
    // Once to check the session is alive, once by core just before the extension call.
    expect(env.refreshes()).toBe(2);
  });

  it("sends nothing when Face ID fails, and can try again inside the window", async () => {
    const env = setup({ owner: ["refused", "ok"] });
    await env.toEmoji();
    await env.a.approve();
    expect(env.a.state.ownerRefused).toBe(true);
    expect(phase(env.a)).toBe("confirming");
    expect(env.relay.log.filter((l) => l.side === "a" && l.msg.type === "sealed")).toHaveLength(0);

    await env.a.approve();
    await env.until(() => env.n.state.phase === "joining");
    expect(env.a.state.ownerRefused).toBe(false);
  });

  it("stops without sending when the account turns out to be signed out", async () => {
    const env = setup({ signedIn: true, token: () => null });
    await env.toEmoji();
    await env.a.approve();
    await env.until(() => env.n.state.phase === "ended");
    expect(endReasonOf(env.a.state)).toBe("approve:no_token");
    expect(env.committed).toHaveLength(0);
    expect(env.relay.log.filter((l) => l.side === "a" && l.msg.type === "sealed")).toHaveLength(0);
  });

  it("runs out after 60 seconds without an answer", async () => {
    const env = setup();
    await env.toEmoji();
    await env.until(() => phase(env.a) === "ended", 90);
    expect(endReasonOf(env.a.state)).toBe("timed_out");
    await env.a.approve();
    expect(env.committed).toHaveLength(0);
  });

  it("denying tells the new device it was cancelled", async () => {
    const env = setup();
    await env.toEmoji();
    await env.a.deny();
    await env.until(() => env.n.state.phase !== "comparing");
    expect(endReasonOf(env.a.state)).toBe("cancelled");
    expect(env.n.state.phase === "ended" || env.n.state.phase === "showing").toBe(true);
    expect(env.committed).toHaveLength(0);
  });

  it("a second phone scanning the same code is turned away", async () => {
    const env = setup();
    const qr = await env.toEmoji();
    const second = createPhoneApprover({
      relay: createPairingRelay(env.relay.origin, env.relay.fetch),
      relayOrigin: env.relay.origin,
      fetch: env.keycloak.fetch,
      clock: env.clock,
      devices: () => undefined,
      confirmOwner: async () => "ok",
      collectEnvelope: async () => {
        throw new Error("never read");
      },
      refreshAccessToken: async () => null,
    });
    second.claim({ qr });
    await env.until(() => second.state.pairing.phase === "ended");
    expect(endReasonOf(second.state)).toBe("already_claimed");
    expect(phase(env.a)).toBe("confirming");
  });

  it("refuses a code that names a relay this phone doesn't use", async () => {
    const env = setup();
    env.a.claim({
      qr: formatPairingQr({ sessionId: new Uint8Array(16), publicKey: new Uint8Array(32), relayOrigin: "https://evil.example" }),
    });
    await env.until(() => phase(env.a) === "ended");
    expect(endReasonOf(env.a.state)).toBe("wrong_relay");
  });
});
