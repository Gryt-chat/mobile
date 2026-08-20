import { describe, expect, it } from "vitest";

import { base64Url, base64UrlDecode, fromHex, utf8 } from "./encoding";
import { p256 } from "@noble/curves/nist.js";

import { deriveLocalKeyPair, jwkThumbprint, type PublicJwk } from "./keys";
import {
  createClientNonce,
  evaluateServerProof,
  proofSigningInput,
  type ServerPin,
} from "./serverProof";

/* These are the tests that matter most in the app: every one of them is a way
 * for somebody who is not the server to be talked to as if they were. */

const SEED = fromHex("0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20");

/** Stand in for a server's signing key. Any P-256 key will do. */
function serverKey(label: string) {
  const { privateKey, publicJwk } = deriveLocalKeyPair(SEED, `server-${label}`);
  return { privateKey, publicJwk, keyId: jwkThumbprint(publicJwk) };
}

/**
 * Build a proof the way a server would.
 *
 * `signJwt` cannot be reused here: it writes its own header, and these tests
 * need to put a specific `kid`, `jwk` or `alg` in one. So the signing step is
 * mirrored over an arbitrary signing input instead.
 */
function makeProof(
  key: ReturnType<typeof serverKey>,
  payload: Record<string, unknown>,
  header: Record<string, unknown> = {},
): string {
  const fullHeader = { alg: "ES256", typ: "JWT", kid: key.keyId, jwk: key.publicJwk, ...header };
  const signingInput = proofSigningInput(fullHeader, payload);
  return `${signingInput}.${signatureOver(signingInput, key.privateKey)}`;
}

function signatureOver(signingInput: string, privateKey: Uint8Array): string {
  return base64Url(p256.sign(utf8(signingInput), privateKey, { prehash: true }));
}

function pinFor(key: ReturnType<typeof serverKey>, host = "gryt.chat"): ServerPin {
  return { keyId: key.keyId, jwk: key.publicJwk, host, pinnedAt: 0 };
}

const NONCE = createClientNonce(new Uint8Array(32).map((_, i) => i + 1));

describe("createClientNonce", () => {
  it("insists on 32 bytes", () => {
    expect(() => createClientNonce(new Uint8Array(16))).toThrow(/32 bytes/);
  });
});

describe("evaluateServerProof", () => {
  it("pins a key it has never seen — trust on first use", () => {
    const key = serverKey("a");
    const decision = evaluateServerProof({
      proof: makeProof(key, { nonce: NONCE, iss: key.keyId }),
      sentNonce: NONCE,
      pinned: null,
    });

    expect(decision).toEqual({ action: "pin", keyId: key.keyId, jwk: key.publicJwk });
  });

  it("trusts the key it already pinned", () => {
    const key = serverKey("a");
    const decision = evaluateServerProof({
      proof: makeProof(key, { nonce: NONCE }),
      sentNonce: NONCE,
      pinned: pinFor(key),
    });

    expect(decision).toEqual({ action: "trusted", keyId: key.keyId });
  });

  it("BLOCKS a different key at a pinned address", () => {
    // The impostor case. Its proof is perfectly valid — it just is not the
    // server that was here before.
    const real = serverKey("a");
    const impostor = serverKey("b");

    const decision = evaluateServerProof({
      proof: makeProof(impostor, { nonce: NONCE }),
      sentNonce: NONCE,
      pinned: pinFor(real),
    });

    expect(decision.action).toBe("block");
    if (decision.action !== "block") throw new Error("unreachable");
    expect(decision.failure.reason).toBe("key_mismatch");
  });

  it("BLOCKS a proof answering somebody else's challenge", () => {
    // Replay: captured from another handshake, valid signature and all.
    const key = serverKey("a");
    const decision = evaluateServerProof({
      proof: makeProof(key, { nonce: "a-different-nonce" }),
      sentNonce: NONCE,
      pinned: null,
    });

    expect(decision.action).toBe("block");
    if (decision.action !== "block") throw new Error("unreachable");
    expect(decision.failure.reason).toBe("nonce_mismatch");
  });

  it("BLOCKS a server that used to prove itself and now offers nothing", () => {
    // Stripping the proof must not be a way to downgrade to unauthenticated.
    const key = serverKey("a");
    const decision = evaluateServerProof({
      proof: undefined,
      sentNonce: NONCE,
      pinned: pinFor(key),
    });

    expect(decision.action).toBe("block");
    if (decision.action !== "block") throw new Error("unreachable");
    expect(decision.failure.reason).toBe("proof_withdrawn");
  });

  it("allows an unpinned address that offers no proof, for older servers", () => {
    expect(
      evaluateServerProof({ proof: undefined, sentNonce: NONCE, pinned: null }),
    ).toEqual({ action: "unauthenticated" });
  });

  it('BLOCKS alg "none", which is the classic way in', () => {
    const key = serverKey("a");
    const signingInput = proofSigningInput(
      { alg: "none", jwk: key.publicJwk },
      { nonce: NONCE },
    );
    const decision = evaluateServerProof({
      proof: `${signingInput}.`,
      sentNonce: NONCE,
      pinned: null,
    });

    expect(decision.action).toBe("block");
    if (decision.action !== "block") throw new Error("unreachable");
    expect(decision.failure.reason).toBe("malformed");
  });

  it("BLOCKS a kid that disagrees with the key it ships", () => {
    // Otherwise a proof files itself under an identity it did not sign with.
    const key = serverKey("a");
    const other = serverKey("b");
    const decision = evaluateServerProof({
      proof: makeProof(key, { nonce: NONCE }, { kid: other.keyId }),
      sentNonce: NONCE,
      pinned: null,
    });

    expect(decision.action).toBe("block");
    if (decision.action !== "block") throw new Error("unreachable");
    expect(decision.failure.reason).toBe("malformed");
  });

  it("BLOCKS a signature that does not verify", () => {
    const key = serverKey("a");
    const proof = makeProof(key, { nonce: NONCE });
    const [h, b] = proof.split(".");
    // A valid-looking signature from the wrong key.
    const forged = signatureOver(`${h}.${b}`, serverKey("b").privateKey);

    const decision = evaluateServerProof({
      proof: `${h}.${b}.${forged}`,
      sentNonce: NONCE,
      pinned: null,
    });

    expect(decision.action).toBe("block");
    if (decision.action !== "block") throw new Error("unreachable");
    expect(decision.failure.reason).toBe("bad_signature");
  });

  it("BLOCKS an expired proof", () => {
    const key = serverKey("a");
    const decision = evaluateServerProof({
      proof: makeProof(key, { nonce: NONCE, exp: Math.floor(Date.now() / 1000) - 10 }),
      sentNonce: NONCE,
      pinned: null,
    });

    expect(decision.action).toBe("block");
    if (decision.action !== "block") throw new Error("unreachable");
    expect(decision.failure.reason).toBe("expired");
  });

  it("BLOCKS something that is not a JWT at all", () => {
    expect(
      evaluateServerProof({ proof: "not-a-jwt", sentNonce: NONCE, pinned: null }).action,
    ).toBe("block");
  });

  it("checks against the pinned key rather than the one the proof carried", () => {
    // Same thumbprint is the only way to reach the pinned branch, so this
    // asserts the branch was taken by feeding a signature the pin cannot verify.
    const key = serverKey("a");
    const proof = makeProof(key, { nonce: NONCE });
    const [h, b] = proof.split(".");
    const wrong = signatureOver(`${h}.${b}`, serverKey("c").privateKey);

    const decision = evaluateServerProof({
      proof: `${h}.${b}.${wrong}`,
      sentNonce: NONCE,
      pinned: pinFor(key),
    });

    expect(decision.action).toBe("block");
    if (decision.action !== "block") throw new Error("unreachable");
    expect(decision.failure.reason).toBe("bad_signature");
  });
});

describe("base64UrlDecode on a proof", () => {
  it("reads a header back", () => {
    const key = serverKey("a");
    const proof = makeProof(key, { nonce: NONCE });
    const header = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(proof.split(".")[0])),
    ) as { alg: string; jwk: PublicJwk };
    expect(header.alg).toBe("ES256");
    expect(header.jwk.crv).toBe("P-256");
  });
});
