import { createApproverPairing, createPairingRelay, type ApproverState, type HistoryArchive, type PairingTokens } from "@gryt/core";
import { asIdentityScope, type HistoryRecord, type PairingEnvelope } from "@gryt/crypto";

import type { ArchivedMessage } from "../archive/messageArchive";
import { historySinkInto } from "./historySink";
import { toHistoryRecord } from "./historyRecords";
import { describe, expect, it } from "vitest";

import { commitLink, type LinkStores } from "./commit";
import { createPhoneNewDevice, type PhoneNewDevice } from "./newDevice";
import { FakeClock, FakeKeycloak, FakeRelay } from "./relay.fake";

const SEED = Uint8Array.from({ length: 32 }, (_, i) => 90 - i);
const KEY = "A".repeat(43);
const PRE_SEED = { scope: "old.example", privateJwk: { kty: "EC", crv: "P-256", x: "x", y: "y", d: "d" }, publicJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" } };

function envelope(account?: PairingEnvelope["account"]): PairingEnvelope {
  return {
    seed: SEED,
    keys: [PRE_SEED],
    servers: [
      { host: "chat.example", name: "Example", scope: asIdentityScope("srv:lineage-1"), nickname: "siv", scheme: "https" },
      { host: "slow.example", name: "Slow", scope: asIdentityScope("slow.example") },
    ],
    pins: { "srv:lineage-1": { "user-2": { thumbprint: "t", dmPublicKey: KEY, firstSeenAt: 1, lastSeenAt: 2, seenOnMls: true } } },
    from: "Sivert's MacBook",
    ...(account ? { account } : {}),
  };
}

const archived = (i: number): ArchivedMessage => ({
  scope: "srv:lineage-1",
  conversationId: "dm-1",
  messageId: `m${i}`,
  sentAt: 1_700_000_000_000 + i,
  senderId: "user-2",
  text: `hello ${i}`,
  attachments: {},
});

/** A's archive over plain records, paged newest first like the phone's and the desktop's. */
function memoryArchive(records: HistoryRecord[]): HistoryArchive {
  return {
    conversations: async () => [{ scope: "srv:lineage-1", conversationId: "dm-1", count: records.length }],
    page: async (_scope, _conversationId, { before, limit }) =>
      records
        .filter((r) => !before || r.sentAt < before.sentAt)
        .sort((a, b) => b.sentAt - a.sentAt)
        .slice(0, limit),
  };
}

function setup(opts: { history?: HistoryRecord[]; sinkFails?: boolean } = {}) {
  const clock = new FakeClock();
  const relay = new FakeRelay(clock);
  const keycloak = new FakeKeycloak();
  const writes: string[] = [];
  const stores: LinkStores = {
    setAuthServer: async (issuer) => void writes.push(`auth ${issuer}`),
    installIdentity: async (seed, keys) => void writes.push(`seed ${seed[0]} keys ${keys.map((k) => k.scope).join(",")}`),
    writeScopes: async (scopes) => void writes.push(`scopes ${scopes.map((s) => `${s.host}=${s.scope}`).join(",")}`),
    mergePins: async (pins) => void writes.push(`pins ${Object.keys(pins).join(",")}`),
    markSeenOnMls: async (scope, member) => void writes.push(`seen ${scope} ${member}`),
    adoptTokens: async (t) => void writes.push(`tokens ${t.accessToken}`),
    addServer: async (s) => void writes.push(`server ${s.host} ${s.nickname ?? "-"} ${s.scheme ?? "-"}`),
  };
  const asked: string[] = [];
  const kept: ArchivedMessage[] = [];

  const n = createPhoneNewDevice({
    relay: createPairingRelay(relay.origin, relay.fetch),
    device: { name: "iPhone", app: "Gryt mobile", platform: "iOS 26.0" },
    oidc: keycloak.oidc,
    clock,
    joinTimeoutMs: 50,
    commit: (e, tokens: PairingTokens | null) => commitLink(e, tokens, stores),
    deviceOn: (host, signal) => {
      asked.push(host);
      if (host === "chat.example") return Promise.resolve("dev-phone");
      // Never gets a session: the timeout gives up on it.
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("gave up"))));
    },
    history: historySinkInto(async (messages) => {
      if (opts.sinkFails) throw new Error("the archive won't open");
      kept.push(...messages);
    }),
  });
  const added: { host: string; deviceId: string }[] = [];
  const a = createApproverPairing({
    relay: createPairingRelay(relay.origin, relay.fetch),
    relayOrigin: relay.origin,
    fetch: keycloak.fetch,
    clock,
    devices: (host) => ({
      addOwnDevice: async (deviceId) => {
        added.push({ host, deviceId });
        return [];
      },
      groupPositions: async () => [],
    }),
    history: opts.history ? memoryArchive(opts.history) : undefined,
    lateWindowMs: 1000,
  });

  async function until(done: () => boolean, maxSeconds = 600) {
    for (let s = 0; ; s++) {
      for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
      await new Promise((r) => setTimeout(r, 1));
      if (done()) return;
      if (s >= maxSeconds) throw new Error("never got there");
      clock.advance(1000);
    }
  }

  async function toEmoji() {
    n.start();
    await until(() => n.state.pairing.phase === "showing");
    const showing = n.state.pairing as Extract<PhoneNewDevice["state"]["pairing"], { phase: "showing" }>;
    a.claim({ qr: showing.qr });
    await until(() => a.state.phase === "confirming");
  }

  return { relay, keycloak, writes, asked, added, kept, n, a, until, toEmoji };
}

const phaseOf = (a: { state: ApproverState }) => a.state.phase;

describe("the phone being linked", () => {
  it("writes the seed, its pre-seed keys and the scopes before the pins and the servers, then says ready", async () => {
    const env = setup();
    await env.toEmoji();
    expect((env.n.state.pairing as { emoji: unknown }).emoji).toEqual((env.a.state as { emoji: unknown }).emoji);
    expect(env.n.state.committed).toBe(false);

    env.a.approve(envelope());
    await env.until(() => phaseOf(env.a) === "done");
    expect(env.writes).toEqual([
      "seed 90 keys old.example",
      "scopes chat.example=srv:lineage-1,slow.example=slow.example",
      "pins srv:lineage-1 user-2",
      "seen srv:lineage-1 user-2",
      "server chat.example siv https",
      "server slow.example - -",
    ]);
    expect(env.n.state.committed).toBe(true);
    expect(env.asked.sort()).toEqual(["chat.example", "slow.example"]);
    // The server that never came up is left for the lazy add.
    expect(env.added).toEqual([{ host: "chat.example", deviceId: "dev-phone" }]);
    await env.until(() => env.n.state.pairing.phase === "done");
  });

  it("keeps the other device's history in its archive, dropping a record that doesn't check out", async () => {
    const bad: HistoryRecord = { ...toHistoryRecord(archived(9)), message: { text: "no sender", attachments: {} } };
    const env = setup({ history: [...[1, 2, 3].map((i) => toHistoryRecord(archived(i))), bad] });
    await env.toEmoji();
    env.a.approve(envelope());
    await env.until(() => env.n.state.pairing.phase === "done");
    expect(env.kept.map((m) => m.messageId).sort()).toEqual(["m1", "m2", "m3"]);
    expect(env.kept.find((m) => m.messageId === "m2")).toEqual(archived(2));
    expect(env.n.state.history).toMatchObject({ complete: true, oldest: archived(1).sentAt });
    expect(env.n.state.history?.messages).toBeGreaterThanOrEqual(3);
  });

  it("stays linked when its archive refuses the history, and says so", async () => {
    const env = setup({ history: [1, 2].map((i) => toHistoryRecord(archived(i))), sinkFails: true });
    await env.toEmoji();
    env.a.approve(envelope());
    await env.until(() => env.n.state.pairing.phase === "ended");
    expect((env.n.state.pairing as { reason: string }).reason).toBe("history_failed");
    expect(env.n.state.committed).toBe(true);
    expect(env.writes).toContain("server chat.example siv https");
  });

  it("signs an account in, pointing at its Keycloak before keeping the tokens", async () => {
    const env = setup();
    await env.toEmoji();
    const account = { issuer: env.keycloak.issuer, clientId: "gryt-web", identityUrl: "https://id.example", sub: "user-1", username: "sivert" };
    env.a.approve(envelope(account), async () => "token:user-1");
    await env.until(() => env.n.state.committed);
    expect(env.writes[0]).toBe(`auth ${env.keycloak.issuer}`);
    expect(env.writes).toContain("tokens token:user-1");
    expect(env.writes.indexOf("tokens token:user-1")).toBeLessThan(env.writes.findIndex((w) => w.startsWith("server ")));
  });

  it("keeps nothing when the account comes back as somebody else", async () => {
    const env = setup();
    await env.toEmoji();
    const account = { issuer: env.keycloak.issuer, clientId: "gryt-web", identityUrl: "https://id.example", sub: "user-1", username: "sivert" };
    env.a.approve(envelope(account), async () => "token:someone-else");
    await env.until(() => env.n.state.pairing.phase === "ended");
    expect((env.n.state.pairing as { reason: string }).reason).toBe("wrong_account");
    expect(env.writes).toEqual([]);
    expect(env.n.state.committed).toBe(false);
  });

  it("keeps nothing when the emoji don't match", async () => {
    const env = setup();
    await env.toEmoji();
    await env.n.mismatch();
    await env.until(() => phaseOf(env.a) === "ended");
    expect((env.a.state as { reason: string }).reason).toBe("cancelled_by_other");
    expect(env.writes).toEqual([]);
  });

  it("shows a new code when the other device never approves", async () => {
    const env = setup();
    await env.toEmoji();
    await env.until(() => env.n.state.pairing.phase === "showing");
    expect((env.n.state.pairing as { renewed?: string }).renewed).toBe("timed_out");
    expect(env.writes).toEqual([]);
    await env.n.cancel();
  });
});
