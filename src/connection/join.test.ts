import { describe, expect, it, vi } from "vitest";

import { buildLocalIdentity } from "../identity/certificate";
import { base64UrlDecode, fromHex } from "../identity/encoding";
import { deriveLocalKeyPair } from "../identity/keys";
import type { ChallengePayload } from "./types";

const SEED = fromHex("0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20");

vi.mock("../identity/localIdentity", () => ({
  getLocalIdentity: async (host: string) => {
    const { publicJwk, privateKey } = deriveLocalKeyPair(SEED, host);
    return buildLocalIdentity(publicJwk, privateKey);
  },
}));

const { joinServer } = await import("./join");

/* A server that answers `server:join` with `challenge` and records what was signed. */
function fakeServer(challenge: ChallengePayload) {
  const handlers = new Map<string, (p: object) => void>();
  const sent: { assertion?: string }[] = [];
  const socket = {
    on: (e: string, fn: (p: object) => void) => handlers.set(e, fn),
    off: (e: string) => handlers.delete(e),
    emit: (e: string, p: { assertion?: string }) => {
      if (e === "server:join") queueMicrotask(() => handlers.get("server:challenge")?.(challenge));
      if (e === "server:verify") {
        sent.push(p);
        queueMicrotask(() => handlers.get("server:joined")?.({ accessToken: "t" }));
      }
    },
  };
  return { socket: socket as never, sent };
}

const claimsOf = (jwt: string) =>
  JSON.parse(new TextDecoder().decode(base64UrlDecode(jwt.split(".")[1]))) as { server_key?: string };

const HOST = "m.example:5000";

describe("joinServer binds the assertion to the proved server key", () => {
  it("refuses a challenge relayed from a server with another key", async () => {
    const { socket, sent } = fakeServer({ nonce: "n", serverHost: HOST, identityTiers: ["local"], serverKey: "key-of-t" });
    await expect(joinServer(socket, HOST, { nickname: "a", provedKey: "key-of-m" })).rejects.toMatchObject({
      code: "server_key_mismatch",
    });
    expect(sent).toEqual([]);
  });

  it("refuses a challenge naming a key when this connection proved none", async () => {
    const { socket } = fakeServer({ nonce: "n", serverHost: HOST, identityTiers: ["local"], serverKey: "key-of-t" });
    await expect(joinServer(socket, HOST, { nickname: "a", provedKey: null })).rejects.toMatchObject({
      code: "server_key_mismatch",
    });
  });

  it("signs the proved key, even when the challenge leaves it out", async () => {
    for (const serverKey of ["key-of-m", undefined]) {
      const { socket, sent } = fakeServer({ nonce: "n", serverHost: HOST, identityTiers: ["local"], serverKey });
      await joinServer(socket, HOST, { nickname: "a", provedKey: "key-of-m" });
      expect(claimsOf(sent[0].assertion!).server_key).toBe("key-of-m");
    }
  });

  it("signs no key for an older server that proved nothing", async () => {
    const { socket, sent } = fakeServer({ nonce: "n", serverHost: HOST, identityTiers: ["local"] });
    await joinServer(socket, HOST, { nickname: "a" });
    expect(claimsOf(sent[0].assertion!).server_key).toBeUndefined();
  });
});
