import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { p256 } from "@noble/curves/nist.js";
import type { Socket } from "socket.io-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { base64Url, fromHex, utf8 } from "../identity/encoding";
import { deriveLocalKeyPair, jwkThumbprint } from "../identity/keys";
import { createClientNonce, evaluateServerProof, proofSigningInput, type ServerPin } from "../identity/serverProof";
import { guardSocket } from "./guard";
import { PROOF_WAIT_MS, mustWait, watchHost } from "./proofGate";

const TOKEN = "access-token-that-must-not-leak";
const BEARER = `Bearer ${TOKEN}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A Gryt server's HTTP side that writes down every request and when it came. */
async function fakeServer() {
  const requests: { path: string; auth: string | null; at: number }[] = [];
  const http: Server = createServer((req, res) => {
    requests.push({ path: req.url ?? "", auth: req.headers.authorization ?? null, at: performance.now() });
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const { port } = http.address() as AddressInfo;
  const host = `127.0.0.1:${port}`;
  servers.push(http);
  return {
    host,
    base: `http://${host}`,
    requests,
    withToken: () => requests.filter((r) => r.auth?.includes(TOKEN)),
  };
}

const servers: Server[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
});

/** The socket side, as far as the guard sees it. */
function fakeSocket() {
  const socket = {
    emit: () => socket,
    io: { opts: { reconnection: true } },
    disconnect: () => socket,
  };
  return socket as unknown as Socket;
}

/** Every way the phone's code, or a library, might hand `fetch` a token. */
function tokenRequests(base: string, signal?: AbortSignal) {
  return [
    fetch(`${base}/api/uploads`, { method: "POST", headers: { Authorization: BEARER }, body: "x", signal }),
    fetch(`${base}/api/link-preview?url=x`, { headers: new Headers({ authorization: BEARER }), signal }),
    fetch(new Request(`${base}/api/emojis`, { headers: { Authorization: BEARER }, signal })),
    fetch(`${base}/api/uploads/avatar`, { headers: [["AUTHORIZATION", BEARER]], signal }),
  ];
}

/* The server's signing key, and the proof an impostor offers with a key of its own. */
const SEED = fromHex("0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20");
function serverKey(label: string) {
  const { privateKey, publicJwk } = deriveLocalKeyPair(SEED, `server-${label}`);
  return { privateKey, publicJwk, keyId: jwkThumbprint(publicJwk) };
}
function proofFrom(key: ReturnType<typeof serverKey>, nonce: string): string {
  const header = { alg: "ES256", typ: "JWT", kid: key.keyId, jwk: key.publicJwk };
  const signingInput = proofSigningInput(header, { nonce, iss: key.keyId });
  return `${signingInput}.${base64Url(p256.sign(utf8(signingInput), key.privateKey, { prehash: true }))}`;
}

describe("HTTP proof gate", () => {
  it("sends nothing with the token to a server that never proves itself", async () => {
    const server = await fakeServer();
    const real = serverKey("real");
    const pinned: ServerPin = { keyId: real.keyId, jwk: real.publicJwk, host: server.host, pinnedAt: 0 };
    const guard = guardSocket(fakeSocket(), server.host);

    const held = tokenRequests(server.base).map((p) => p.then(() => "sent", (e: Error) => e.message));
    await sleep(150);
    expect(server.requests).toEqual([]);

    // A request without a token is not held.
    await fetch(`${server.base}/info`);
    expect(server.requests.map((r) => r.path)).toEqual(["/info"]);

    // The identity timeout, as `useConnection` runs it: no proof against a pin is a refusal.
    const nonce = createClientNonce(new Uint8Array(32).fill(7));
    const decision = evaluateServerProof({ proof: undefined, sentNonce: nonce, pinned });
    expect(decision.action).toBe("block");
    guard.refuse();

    for (const outcome of await Promise.all(held)) expect(outcome).toMatch(/has not proved its identity/);
    // And after the refusal, a new one fails at once.
    const after = await Promise.allSettled(tokenRequests(server.base));
    expect(after.every((r) => r.status === "rejected")).toBe(true);
    expect(server.withToken()).toEqual([]);
  });

  it("refuses an impostor's proof, and nothing with the token reaches it", async () => {
    const server = await fakeServer();
    const real = serverKey("real");
    const pinned: ServerPin = { keyId: real.keyId, jwk: real.publicJwk, host: server.host, pinnedAt: 0 };
    const guard = guardSocket(fakeSocket(), server.host);

    const held = Promise.allSettled(tokenRequests(server.base));
    const nonce = createClientNonce(new Uint8Array(32).fill(9));
    const decision = evaluateServerProof({ proof: proofFrom(serverKey("impostor"), nonce), sentNonce: nonce, pinned });
    expect(decision.action).toBe("block");
    guard.refuse();

    expect((await held).every((r) => r.status === "rejected")).toBe(true);
    expect(server.requests).toEqual([]);
  });

  it("sends once the server has proved itself, never before", async () => {
    const server = await fakeServer();
    const guard = guardSocket(fakeSocket(), server.host);

    const held = Promise.all(tokenRequests(server.base));
    await sleep(100);
    expect(server.requests).toEqual([]);

    const provedAt = performance.now();
    guard.release();
    await held;
    expect(server.withToken()).toHaveLength(4);
    for (const r of server.withToken()) expect(r.at).toBeGreaterThanOrEqual(provedAt);
  });

  it("holds again after the socket drops, until the next connection proves itself", async () => {
    const server = await fakeServer();
    const guard = guardSocket(fakeSocket(), server.host);
    guard.release();
    await fetch(`${server.base}/a`, { headers: { Authorization: BEARER } });
    expect(server.withToken()).toHaveLength(1);

    guard.hold();
    const held = fetch(`${server.base}/b`, { headers: { Authorization: BEARER } });
    await sleep(100);
    expect(server.withToken()).toHaveLength(1);

    guard.release();
    await held;
    expect(server.withToken().map((r) => r.path)).toEqual(["/a", "/b"]);
  });

  it("fails a request that waits too long, without sending it", async () => {
    const server = await fakeServer();
    guardSocket(fakeSocket(), server.host);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const held = fetch(`${server.base}/late`, { headers: { Authorization: BEARER } });
    const outcome = held.then(() => "sent", (e: Error) => e.message);
    vi.advanceTimersByTime(PROOF_WAIT_MS);
    expect(await outcome).toMatch(/did not prove its identity in time/);
    expect(server.requests).toEqual([]);
  });

  it("lets the caller abort a waiting request", async () => {
    const server = await fakeServer();
    guardSocket(fakeSocket(), server.host);
    const controller = new AbortController();

    const held = Promise.allSettled(tokenRequests(server.base, controller.signal));
    await sleep(100);
    controller.abort();
    expect((await held).every((r) => r.status === "rejected")).toBe(true);
    expect(server.requests).toEqual([]);
  });

  it("does not hold a host no guard looks after", async () => {
    const server = await fakeServer();
    await fetch(`${server.base}/elsewhere`, { headers: { Authorization: BEARER } });
    expect(server.withToken()).toHaveLength(1);
  });

  it("matches a host however its URL spells it", () => {
    watchHost("Gryt.Example:443");
    expect(mustWait("https://gryt.example/api/uploads")).toBe(true);
    expect(mustWait("http://gryt.example:80/x")).toBe(true);
    expect(mustWait("https://gryt.example:5001/x")).toBe(false);
    expect(mustWait("https://other.example/x")).toBe(false);

    watchHost("[::1]:5001");
    expect(mustWait("http://[::1]:5001/x")).toBe(true);
    expect(mustWait("http://[::1]/x")).toBe(false);
  });
});
