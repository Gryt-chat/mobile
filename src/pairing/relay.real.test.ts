import { createNewDevicePairing, createPairingRelay, type NewDeviceState, type PairingTokens } from "@gryt/core";
import type { PairingEnvelope } from "@gryt/crypto";
import { describe, expect, it } from "vitest";

import { createPhoneApprover, type PhoneApprover } from "./approver";
import { buildEnvelope } from "./envelope";
import { FakeKeycloak } from "./relay.fake";

/* Against a real relay from auth#45 when GRYT_PAIRING_RELAY names one, e.g. http://localhost:5013.
   Keycloak stays the fake: the extension (auth#46) needs a whole Keycloak to run. */
const RELAY = process.env.GRYT_PAIRING_RELAY;
const fetchJson = (url: string, init: RequestInit) => fetch(url, init);

async function until(done: () => boolean, ms = 20_000) {
  for (const end = Date.now() + ms; !done(); ) {
    if (Date.now() > end) throw new Error("never got there");
    await new Promise((r) => setTimeout(r, 20));
  }
}

function pair(signedIn: boolean) {
  const keycloak = new FakeKeycloak();
  const committed: { envelope: PairingEnvelope; tokens: PairingTokens | null }[] = [];
  const n = createNewDevicePairing({
    relay: createPairingRelay(RELAY!, fetchJson),
    device: { name: "MacBook Air", app: "Gryt desktop", platform: "macOS" },
    storage: { commit: async (envelope, tokens) => void committed.push({ envelope, tokens }) },
    oidc: keycloak.oidc,
  });
  const a: PhoneApprover = createPhoneApprover({
    relay: createPairingRelay(RELAY!, fetchJson),
    relayOrigin: RELAY!,
    fetch: keycloak.fetch,
    devices: (host) => ({
      addOwnDevice: async (deviceId) => [{ conversationId: `${host}:${deviceId}`, groupId: "g", outcome: "added", add: null }],
    }),
    confirmOwner: async () => "ok",
    collectEnvelope: async () =>
      buildEnvelope({
        seed: Uint8Array.from({ length: 32 }, (_, i) => 200 - i),
        account: signedIn
          ? { issuer: keycloak.issuer, clientId: "gryt-web", identityUrl: "https://id.example", sub: "user-1", username: "sivert" }
          : null,
        servers: [{ host: "chat.example", name: "Example" }],
        scopeFor: (h) => h,
        pins: {},
        seenOnMls: {},
        from: "iPhone",
      }),
    refreshAccessToken: async () => "token:user-1",
  });
  return { n, a, committed };
}

describe.skipIf(!RELAY)("the phone pairing through a real relay", () => {
  for (const [label, signedIn, by] of [
    ["a guest, by QR", false, "qr"],
    ["an account, by typed code", true, "code"],
  ] as const) {
    it(`links ${label}`, async () => {
      const { n, a, committed } = pair(signedIn);
      n.start();
      await until(() => n.state.phase === "showing");
      const showing = n.state as Extract<NewDeviceState, { phase: "showing" }>;
      a.claim(by === "qr" ? { qr: showing.qr } : { code: showing.code.toLowerCase() });
      await until(() => a.state.pairing.phase === "confirming");
      expect((a.state.pairing as { emoji: unknown }).emoji).toEqual((n.state as { emoji: unknown }).emoji);

      await a.approve();
      await until(() => n.state.phase === "joining", 30_000);
      expect(committed[0].envelope.servers[0].scope).toBe("chat.example");
      expect(committed[0].tokens?.accessToken ?? null).toBe(signedIn ? "token:user-1" : null);

      await n.ready([{ host: "chat.example", deviceId: "dev-n" }]);
      await until(() => a.state.pairing.phase === "done" && n.state.phase === "done");
    }, 60_000);
  }
});
