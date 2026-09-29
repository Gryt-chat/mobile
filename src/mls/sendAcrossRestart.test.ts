import type { MlsDmContent, MlsServerCapability } from "@gryt/core";
import { FakeDeliveryService, MemoryMlsStore } from "@gryt/core/testing";
import {
  asIdentityScope,
  createMlsDevice,
  derivePersonKeyPair,
  pinPeerKey,
  pinPersonKey,
  type PeerPin,
  type VerifiedDmKeyBinding,
  type VerifiedPersonKeyBinding,
} from "@gryt/crypto";
import { describe, expect, it } from "vitest";

import type { ArchivedMessage, MessageArchive } from "../archive/messageArchive";
import { createMlsSession, type SessionSocket } from "./session";

/*
 * An MLS DM across a server restart, headless: the phone's own session and transport over a
 * socket.io stand-in, with the real driver behind @gryt/core's fake server (GRYT-1584).
 */

const SCOPE = asIdentityScope("srv:restart-test");
const CAPABILITY: MlsServerCapability = { version: 1, ciphersuites: [1], retentionDays: 30 };
const seed = (n: number) => Uint8Array.from({ length: 32 }, (_, i) => (i * n + n) % 251);
const SEEDS: Record<string, Uint8Array> = { kari: seed(3), ola: seed(5) };
const EVENTS: Record<string, string> = {
  "mls:keypackages:publish": "publishKeyPackages",
  "mls:keypackages:claim": "claimKeyPackages",
  "mls:devices": "listDevices",
  "mls:device:remove": "removeDevice",
  "mls:group:create": "createGroup",
  "mls:commit": "commit",
  "mls:send": "send",
  "mls:log:fetch": "fetchLog",
  "mls:sync": "sync",
  "mls:welcome:ack": "ackWelcomes",
};

type Listener = (payload?: unknown) => void;

/** A socket.io socket as the session sees it: emits with acks, pushes, and a connection to lose. */
function socketTo(fake: FakeDeliveryService, who: string) {
  const { transport, socket: server } = fake.connect(who);
  const calls = transport as unknown as Record<string, (req: unknown) => Promise<unknown>>;
  const listeners = new Map<string, Set<Listener>>();
  const fire = (event: string, payload?: unknown) => {
    for (const listener of [...(listeners.get(event) ?? [])]) listener(payload);
  };
  const emitted: string[] = [];
  let dropNextAck = false;
  const socket = {
    connected: true,
    emit(event: string, payload: Record<string, unknown>, ack: (reply: unknown) => void) {
      emitted.push(event);
      const lose = dropNextAck && event === "mls:send";
      if (lose) dropNextAck = false;
      const req = { ...payload };
      delete req.accessToken;
      void calls[EVENTS[event]](req).then((reply) => {
        if (!lose && socket.connected) ack(reply);
      });
    },
    on(event: string, listener: Listener) {
      listeners.set(event, new Set([...(listeners.get(event) ?? []), listener]));
    },
    off(event: string, listener: Listener) {
      listeners.get(event)?.delete(listener);
    },
  };
  server.driver = {
    handleMessage: async (entry: unknown) => fire("mls:message", entry),
    handleWelcome: async (welcome: unknown) => fire("mls:welcome", welcome),
    handleDevicesChanged: async (push: unknown) => fire("mls:devices:changed", push),
  } as never;
  return {
    socket: socket as unknown as SessionSocket,
    emitted,
    /** The server stops answering and the socket notices, like a restart. */
    drop() {
      socket.connected = false;
      server.reachable = false;
      fire("disconnect");
    },
    back() {
      socket.connected = true;
      server.reachable = true;
    },
    /** The server writes the next mls:send and dies before it acks. */
    loseNextAck() {
      dropNextAck = true;
    },
  };
}

function archive() {
  const rows = new Map<string, ArchivedMessage>();
  const key = (scope: string, conversationId: string, id: string) => `${scope}|${conversationId}|${id}`;
  const messages = {
    get: async (scope: string, conversationId: string, id: string) => rows.get(key(scope, conversationId, id)) ?? null,
    put: async (list: ArchivedMessage[]) => {
      for (const m of list) rows.set(key(m.scope, m.conversationId, m.messageId), structuredClone(m));
    },
    remove: async (scope: string, conversationId: string, id: string) => void rows.delete(key(scope, conversationId, id)),
  };
  return { rows, messages: messages as unknown as MessageArchive };
}

function member(fake: FakeDeliveryService, who: string) {
  const peer = who === "kari" ? "ola" : "kari";
  let pins: Record<string, PeerPin> = {};
  const pinStore = { read: () => structuredClone(pins), write: (p: Record<string, PeerPin>) => void (pins = structuredClone(p)) };
  pinPeerKey(pinStore, SCOPE, peer, { dmPublicKey: new Uint8Array(32), identityThumbprint: `id-${peer}` } as VerifiedDmKeyBinding);
  pinPersonKey(pinStore, SCOPE, peer, {
    personPublicKey: derivePersonKeyPair(SEEDS[peer], SCOPE).publicKey,
    identityThumbprint: `id-${peer}`,
    scope: SCOPE,
    signedAt: 0,
  } as VerifiedPersonKeyBinding);
  const seen = new Set<string>();
  const line = socketTo(fake, who);
  const { rows, messages } = archive();
  const archived: { conversationId: string; seq: number; epoch: number; record: ArchivedMessage }[] = [];
  const session = createMlsSession({
    socket: line.socket,
    storeScope: SCOPE,
    dmScope: SCOPE,
    serverUserId: who,
    capability: CAPABILITY,
    getAccessToken: async () => "token",
    messages,
    store: new MemoryMlsStore(),
    pinStore,
    seen: { has: async (id) => seen.has(id), add: async (id) => void seen.add(id) },
    ownPersonKey: derivePersonKeyPair(SEEDS[who], SCOPE).publicKey,
    newDevice: async () => createMlsDevice({ seed: SEEDS[who], scope: SCOPE, deviceName: who }),
    onArchived: (a) => void archived.push(a),
  });
  const texts = () => [...rows.values()].map((m) => m.text);
  return { session, line, texts, archived };
}

const message = (id: string, text: string): MlsDmContent => ({ type: "message", id, text });

async function pair() {
  const fake = new FakeDeliveryService(SCOPE);
  const dm = fake.dm("kari", "ola");
  const kari = member(fake, "kari");
  const ola = member(fake, "ola");
  await kari.session.start();
  await ola.session.start();
  await kari.session.send(dm, "ola", message("m0", "before"));
  await expect.poll(() => ola.texts()).toEqual(["before"]);
  const logged = () => fake.groups.get(dm)!.log.filter((e) => e.kind === "application").length;
  return { dm, kari, ola, logged };
}

describe("an MLS DM across a server restart", () => {
  it("waits while the server is down, says so, and goes out once it's back", async () => {
    const { dm, kari, ola, logged } = await pair();
    kari.line.drop();
    let done = false;
    const sending = kari.session.send(dm, "ola", message("m1", "while down")).finally(() => (done = true));
    await expect.poll(() => kari.session.waiting()).toBe(true);
    expect(done).toBe(false);

    kari.line.back();
    await kari.session.start();
    await sending;
    expect(kari.session.waiting()).toBe(false);
    await expect.poll(() => ola.texts()).toEqual(["before", "while down"]);
    expect(logged()).toBe(2);
  });

  it("goes out once when the server wrote it and died before the ack", async () => {
    const { dm, kari, ola, logged } = await pair();
    kari.line.loseNextAck();
    const sending = kari.session.send(dm, "ola", message("m1", "ack lost"));
    await expect.poll(logged).toBe(2);
    kari.line.drop();
    await expect.poll(() => kari.session.waiting(), { timeout: 5000 }).toBe(true);
    kari.line.back();
    await kari.session.start();
    await sending;
    await expect.poll(() => ola.texts()).toEqual(["before", "ack lost"]);
    expect(logged()).toBe(2);
  });

  it("sends what was typed while down in the order it was typed", async () => {
    const { dm, kari, ola } = await pair();
    kari.line.drop();
    const sends = ["one", "two", "three"].map((text, i) => kari.session.send(dm, "ola", message(`n${i}`, text)));
    await expect.poll(() => kari.session.waiting()).toBe(true);
    kari.line.back();
    await kari.session.start();
    await Promise.all(sends);
    await expect.poll(() => ola.texts()).toEqual(["before", "one", "two", "three"]);
  });

  it("emits nothing while the socket is down, and fails what's waiting when the session goes", async () => {
    const { dm, kari } = await pair();
    kari.line.drop();
    const before = kari.line.emitted.length;
    const sending = kari.session.send(dm, "ola", message("m1", "held"));
    await expect.poll(() => kari.session.waiting()).toBe(true);
    expect(kari.line.emitted.length).toBe(before);
    await kari.session.dispose();
    await expect(sending).rejects.toMatchObject({ code: "stopped" });
  });
});

describe("what a pairing's history tail hears from the session (GRYT-1484)", () => {
  it("passes on every archive write, sent with epoch -1, and says where each group is", async () => {
    const { dm, kari, ola } = await pair();
    const sent = kari.archived.find((a) => a.record.messageId === "m0");
    expect(sent).toMatchObject({ conversationId: dm, epoch: -1, record: { text: "before", senderId: "kari" } });
    const got = ola.archived.find((a) => a.record.messageId === "m0");
    expect(got?.seq).toBe(sent?.seq);
    expect(got?.epoch).toBeGreaterThanOrEqual(0);

    await kari.session.send(dm, "ola", { type: "edit", id: "m0", text: "after" });
    await expect.poll(() => ola.archived.filter((a) => a.record.messageId === "m0").map((a) => a.record.text)).toEqual([
      "before",
      "after",
    ]);
    const heard = ola.archived.length;
    await kari.session.send(dm, "ola", { type: "delete", id: "m0" });
    await expect.poll(() => ola.texts()).toEqual([]);
    expect(ola.archived.length).toBe(heard);

    const positions = await ola.session.groupPositions();
    expect(positions).toEqual([expect.objectContaining({ conversationId: dm })]);
    expect(positions[0].seq).toBeGreaterThanOrEqual(got!.seq);
  });
});
