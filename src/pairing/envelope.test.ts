import { decodePairingEnvelope, encodePairingEnvelope, type PeerPin } from "@gryt/crypto";
import { describe, expect, it } from "vitest";

import { buildEnvelope, pinsByScope } from "./envelope";

const SEED = Uint8Array.from({ length: 32 }, (_, i) => i + 7);
const KEY = "A".repeat(43);

const pin = (extra: Partial<PeerPin> = {}): PeerPin => ({
  thumbprint: "thumb",
  dmPublicKey: KEY,
  firstSeenAt: 1,
  lastSeenAt: 2,
  ...extra,
});

describe("the envelope this phone sends", () => {
  it("groups the pin store by scope, marking who has been seen on MLS", () => {
    const grouped = pinsByScope(
      {
        "srv:abc user-1": pin({ comparedAt: 5 }),
        "srv:abc user-2": pin({ personPublicKey: KEY }),
        "chat.example user-3": pin(),
      },
      { "srv:abc": new Set(["user-2"]) },
    );
    expect(grouped).toEqual({
      "srv:abc": {
        "user-1": { ...pin(), comparedAt: 5 },
        "user-2": { ...pin(), personPublicKey: KEY, seenOnMls: true },
      },
      "chat.example": { "user-3": pin() },
    });
  });

  it("skips keys that aren't a scope and a member, and anything aimed at a prototype", () => {
    expect(pinsByScope({ nospace: pin(), " lead": pin(), "trail ": pin(), "__proto__ x": pin() }, {})).toEqual({});
  });

  it("names each server's scope the way this phone derives its guest key", () => {
    const envelope = buildEnvelope({
      seed: SEED,
      keys: [],
      account: null,
      servers: [{ host: "Chat.Example:5000", name: "Example" }],
      scopeFor: (host) => host.toLowerCase(),
      pins: {},
      seenOnMls: {},
      from: "iPhone",
    });
    expect(envelope.servers).toEqual([{ host: "Chat.Example:5000", name: "Example", scope: "chat.example:5000" }]);
    expect(envelope.account).toBeUndefined();
    expect(envelope.keys).toEqual([]);
  });

  it("round-trips through the decoder the new device runs, kept keys included", async () => {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const key = {
      scope: "srv:old",
      privateJwk: { kty: "EC", crv: "P-256", d: privateJwk.d, x: privateJwk.x, y: privateJwk.y },
      publicJwk: { kty: "EC", crv: "P-256", x: publicJwk.x, y: publicJwk.y },
    };
    const envelope = buildEnvelope({
      seed: SEED,
      keys: [key],
      account: {
        issuer: "https://auth.gryt.chat/realms/gryt",
        clientId: "gryt-web",
        identityUrl: "https://id.gryt.chat",
        sub: "user-1",
        username: "sivert",
      },
      servers: [{ host: "chat.example", name: "Example", nickname: "siv", scheme: "https" }],
      scopeFor: (host) => host,
      pins: { "srv:abc user-1": pin() },
      seenOnMls: { "srv:abc": new Set(["user-1"]) },
      from: "iPhone",
    });
    const back = decodePairingEnvelope(encodePairingEnvelope(envelope));
    expect(back).toEqual(envelope);
    expect(back.keys).toEqual([key]);
  });
});
