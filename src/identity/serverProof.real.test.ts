import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { base64UrlDecode } from "./encoding";
import { jwkThumbprint, type PublicJwk } from "./keys";
import { evaluateServerProof, type ServerPin } from "./serverProof";

/**
 * A real proof, captured from a real Gryt server over a real socket.
 *
 * The hand-built proofs in `serverProof.test.ts` prove the refusals. This one
 * proves the acceptance, which is the half that stopped working on a device
 * while the unit tests stayed green (GRYT-418) — a server whose key had not
 * changed was refused against its own pin.
 *
 * The nonce is fixed because the capture asked for it, so this stays a fixture
 * rather than something that has to be regenerated.
 */
const PROOF = "eyJhbGciOiJFUzI1NiIsImtpZCI6Ik1GUkZHY1U2S1NxZFhsQi1BLW5XbnJ4b1NlTUpaLWI3Znp0U3drUHB4b0kiLCJqd2siOnsia3R5IjoiRUMiLCJ4IjoienF2YTZFYmNBY00wS1BPMjdsX3Z0NjF6Z3AwQzdyRlB0STdoR0Y4RXJ3MCIsInkiOiJFbWJ1S2toVlpaTEU4V01TeWIwSkVHTXZoTHpZSjVHZ0V5b284UmxUVmxJIiwiY3J2IjoiUC0yNTYiLCJ1c2UiOiJzaWciLCJhbGciOiJFUzI1NiIsImtpZCI6Ik1GUkZHY1U2S1NxZFhsQi1BLW5XbnJ4b1NlTUpaLWI3Znp0U3drUHB4b0kifX0.eyJub25jZSI6ImZpeGVkLXRlc3Qtbm9uY2UiLCJpc3MiOiJNRlJGR2NVNktTcWRYbEItQS1uV25yeG9TZU1KWi1iN2Z6dFN3a1BweG9JIiwiaWF0IjoxNzg3MzAwNDcxLCJleHAiOjE3ODczMDA1MzF9.L8C9jUEqr3ouMM4U4cgUFn6CLuDknqvZdlMF98xCuegb6vbI0aN35Qt9ghT7_5dHNctECiyJWO2zcbRCaY-7uQ";
const NONCE = "fixed-test-nonce";

/**
 * The proof carries a 60-second `exp`, so the clock is pinned to the moment it
 * was issued. Without this the fixture works for one minute after capture and
 * then fails as "expired" forever, which is a test that rots by design.
 */
beforeAll(() => {
  const payload = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(PROOF.split(".")[1])),
  ) as { iat: number };
  vi.useFakeTimers();
  vi.setSystemTime(payload.iat * 1000);
});

afterAll(() => {
  vi.useRealTimers();
});

function jwkFromProof(): PublicJwk {
  const header = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(PROOF.split(".")[0])),
  ) as { jwk: PublicJwk };
  return header.jwk;
}

describe("a real server proof", () => {
  it("is pinned on first sight", () => {
    const decision = evaluateServerProof({ proof: PROOF, sentNonce: NONCE, pinned: null });
    expect(decision.action).toBe("pin");
  });

  it("verifies against its own pin, JSON round-tripped as storage does it", () => {
    // This is the GRYT-418 case. The pin goes through AsyncStorage, so it comes
    // back parsed from a string rather than as the object the proof carried.
    const jwk = jwkFromProof();
    const stored: ServerPin = JSON.parse(
      JSON.stringify({
        keyId: jwkThumbprint(jwk),
        jwk,
        host: "localhost:5002",
        pinnedAt: 1,
      }),
    );

    const decision = evaluateServerProof({ proof: PROOF, sentNonce: NONCE, pinned: stored });
    expect(decision).toEqual({ action: "trusted", keyId: stored.keyId });
  });

  it("verifies against a pin holding only the four members it needs", () => {
    // The server's JWK carries `use`, `alg` and `kid` as well. If anything
    // depended on those surviving storage, this is where it would show.
    const { kty, crv, x, y } = jwkFromProof();
    const minimal: PublicJwk = { kty, crv, x, y };

    const decision = evaluateServerProof({
      proof: PROOF,
      sentNonce: NONCE,
      pinned: { keyId: jwkThumbprint(minimal), jwk: minimal, host: "h", pinnedAt: 1 },
    });
    expect(decision.action).toBe("trusted");
  });
});
