import { createApproverPairing, createPairingRelay } from "@gryt/core";
import { asIdentityScope } from "@gryt/crypto";
import { describe, expect, it } from "vitest";

import { commitLink } from "./commit";
import { createPhoneNewDevice } from "./newDevice";
import { FakeKeycloak } from "./relay.fake";

/* Against a real relay from auth#45 when GRYT_PAIRING_RELAY names one, e.g. http://localhost:5013.
   Keycloak stays the fake: the extension (auth#46) needs a whole Keycloak to run. */
const RELAY = process.env.GRYT_PAIRING_RELAY;

async function until(done: () => boolean, ms = 30_000) {
  for (const end = Date.now() + ms; !done(); ) {
    if (Date.now() > end) throw new Error("never got there");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe.skipIf(!RELAY)("the phone being linked through a real relay", () => {
  for (const [label, signedIn, by] of [
    ["as a guest, by QR", false, "qr"],
    ["as an account, by typed code", true, "code"],
  ] as const) {
    it(`links ${label}`, async () => {
      const keycloak = new FakeKeycloak();
      const writes: string[] = [];
      const n = createPhoneNewDevice({
        relay: createPairingRelay(RELAY!, fetch),
        device: { name: "iPhone", app: "Gryt mobile", platform: "iOS 26.0" },
        oidc: keycloak.oidc,
        commit: (envelope, tokens) =>
          commitLink(envelope, tokens, {
            setAuthServer: async (issuer) => void writes.push(`auth ${issuer}`),
            installIdentity: async () => void writes.push("seed"),
            writeScopes: async () => void writes.push("scopes"),
            mergePins: async () => void writes.push("pins"),
            markSeenOnMls: async () => undefined,
            adoptTokens: async (t) => void writes.push(`tokens ${t.accessToken}`),
            addServer: async (s) => void writes.push(`server ${s.host}`),
          }),
        deviceOn: async () => "dev-phone",
      });
      const added: string[] = [];
      const a = createApproverPairing({
        relay: createPairingRelay(RELAY!, fetch),
        relayOrigin: RELAY!,
        fetch: keycloak.fetch,
        devices: (host) => ({ addOwnDevice: async (id) => (added.push(`${host} ${id}`), []) }),
      });

      n.start();
      await until(() => n.state.pairing.phase === "showing");
      const showing = n.state.pairing as { qr: string; code: string };
      a.claim(by === "qr" ? { qr: showing.qr } : { code: showing.code });
      await until(() => a.state.phase === "confirming");
      a.approve(
        {
          seed: Uint8Array.from({ length: 32 }, (_, i) => i + 11),
          keys: [],
          servers: [{ host: "chat.example", name: "Example", scope: asIdentityScope("srv:lineage-1") }],
          pins: {},
          from: "Sivert's MacBook",
          ...(signedIn
            ? { account: { issuer: keycloak.issuer, clientId: "gryt-web", identityUrl: "https://id.example", sub: "user-1", username: "sivert" } }
            : {}),
        },
        signedIn ? async () => "token:user-1" : undefined,
      );
      await until(() => a.state.phase === "done", 40_000);
      expect(added).toEqual(["chat.example dev-phone"]);
      expect(writes).toEqual([
        ...(signedIn ? [`auth ${keycloak.issuer}`] : []),
        "seed",
        "scopes",
        "pins",
        ...(signedIn ? ["tokens token:user-1"] : []),
        "server chat.example",
      ]);
      await until(() => n.state.pairing.phase === "done");
    }, 60_000);
  }
});
