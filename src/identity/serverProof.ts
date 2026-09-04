import { base64Url, base64UrlDecode, utf8 } from "./encoding";
import { jwkThumbprint, verifyJwtSignature, type PublicJwk } from "./keys";

/* Checking that the server at this address is the one that was here last time.
 *
 * This is the half of the handshake that protects the *user*. Everything else
 * proves who they are to the server; this proves the server to them, and
 * without it a machine in the middle of the connection can collect an
 * assertion and replay it. The desktop client refuses to send anything at all
 * until this settles, and so does the guard in `src/connection`.
 *
 * Trust on first use, like SSH: the first key seen for an address is pinned,
 * and a different one afterwards is refused. That is a real assumption — the
 * first connection is taken on faith — and it is the same one every
 * self-hosted thing without a CA has to make.
 *
 * Ported from the desktop client's `server-pins.ts`. **The key rotation path
 * is not**: the client accepts a new key when the server produces a succession
 * statement signed by the pinned one, and this refuses. Refusing fails closed,
 * so a rotated server stops working rather than being silently accepted by an
 * impostor. GRYT-415 carries the vouch chain.
 */

/**
 * The prefix a server's scope carries, so it cannot be mistaken for an address.
 *
 * Matches `SERVER_SCOPE_PREFIX` in the desktop client's `identity-keys.ts`.
 * The two derive the same DM key for the same person on the same server, and
 * the scope string is the whole of what makes that true.
 */
export const SERVER_SCOPE_PREFIX = "srv:";

export interface ServerPin {
  keyId: string;
  jwk: PublicJwk;
  host: string;
  pinnedAt: number;
  /**
   * A name for this server that a key rotation would not change (GRYT-732).
   * The same as `keyId` on every pin so far, since a rotated server is refused
   * rather than accepted — **written now because the DM key derives from it**,
   * and a key derived from something that resets makes a conversation
   * unreadable the day the server rotates.
   *
   * Optional, because pins written before this do not have it; `dmScopeFor`
   * falls back to `keyId`, which is the same string.
   */
  originKeyId?: string;
}

export type ProofFailure =
  | { reason: "malformed"; detail: string }
  | { reason: "expired"; detail: string }
  | { reason: "nonce_mismatch"; detail: string }
  | { reason: "bad_signature"; detail: string }
  | { reason: "proof_withdrawn"; detail: string; expectedKeyId: string }
  | { reason: "key_mismatch"; detail: string; expectedKeyId: string; presentedKeyId: string };

export type ProofDecision =
  /** Known key, signature checked against the pin. */
  | { action: "trusted"; keyId: string }
  /** Never seen this key. Pin it — the trust-on-first-use moment. */
  | { action: "pin"; keyId: string; jwk: PublicJwk }
  /** Offered nothing, and nothing was ever pinned here. An older server. */
  | { action: "unauthenticated" }
  | { action: "block"; failure: ProofFailure };

interface ParsedProof {
  keyId: string;
  jwk: PublicJwk;
  nonce: string;
  signingInput: string;
  signature: Uint8Array;
}

function parseProof(proof: string): ParsedProof | ProofFailure {
  const parts = proof.split(".");
  if (parts.length !== 3) {
    return { reason: "malformed", detail: "Not a three-part JWT" };
  }

  let header: { alg?: string; kid?: string; jwk?: PublicJwk };
  let payload: { nonce?: string; iss?: string; exp?: number; iat?: number };
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  } catch (e) {
    return { reason: "malformed", detail: `Undecodable JWT: ${String(e)}` };
  }

  // Refuse to be talked into another algorithm by the token itself. `"none"`
  // is the classic version of this.
  if (header.alg !== "ES256") {
    return { reason: "malformed", detail: `Unexpected alg "${header.alg}"` };
  }
  if (!header.jwk) {
    return { reason: "malformed", detail: "Proof carries no key" };
  }
  if (typeof payload.nonce !== "string") {
    return { reason: "malformed", detail: "Proof carries no nonce" };
  }

  let keyId: string;
  try {
    keyId = jwkThumbprint(header.jwk);
  } catch (e) {
    return { reason: "malformed", detail: String(e) };
  }

  // `kid` and `iss` are the server's claims about its own key. They have to
  // agree with the key actually present, or the identity it is filed under is
  // not the one that signed.
  if (header.kid && header.kid !== keyId) {
    return { reason: "malformed", detail: "Header kid does not match the key" };
  }
  if (payload.iss && payload.iss !== keyId) {
    return { reason: "malformed", detail: "Issuer does not match the key" };
  }

  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
    return { reason: "expired", detail: "Proof has expired" };
  }

  return {
    keyId,
    jwk: header.jwk,
    nonce: payload.nonce,
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: base64UrlDecode(parts[2]),
  };
}

/**
 * Decide whether to go on talking to whatever answered at this address.
 *
 * Deliberately writes nothing — the caller applies the outcome, so a decision
 * can be tested and logged without a pin appearing as a side effect.
 */
export function evaluateServerProof(args: {
  proof: string | undefined;
  sentNonce: string;
  /** What is already pinned for this address, if anything. */
  pinned: ServerPin | null;
}): ProofDecision {
  const { proof, sentNonce, pinned } = args;

  if (!proof) {
    // A server that proved itself here before and now offers nothing is either
    // an impostor stripping the proof or a genuine downgrade. Both are refused:
    // accepting silently would make the whole thing optional for an attacker.
    if (pinned) {
      return {
        action: "block",
        failure: {
          reason: "proof_withdrawn",
          detail: "This address proved its identity before and no longer does.",
          expectedKeyId: pinned.keyId,
        },
      };
    }
    // Never had a proof here. An older server, so carry on unpinned rather than
    // locking people out of servers that have not been upgraded yet.
    return { action: "unauthenticated" };
  }

  const parsed = parseProof(proof);
  if ("reason" in parsed) return { action: "block", failure: parsed };

  // Replay: a proof captured from another handshake.
  if (parsed.nonce !== sentNonce) {
    return {
      action: "block",
      failure: { reason: "nonce_mismatch", detail: "Proof answers a different challenge." },
    };
  }

  if (pinned && pinned.keyId !== parsed.keyId) {
    return {
      action: "block",
      failure: {
        reason: "key_mismatch",
        detail: "A different server is answering at this address.",
        expectedKeyId: pinned.keyId,
        presentedKeyId: parsed.keyId,
      },
    };
  }

  if (pinned) {
    // Checked against the *stored* key rather than the one the proof carried.
    // They are provably the same here — equal thumbprints mean equal
    // crv/kty/x/y — but verifying against the pin is the property actually
    // wanted, and it should not depend on the reader reconstructing that.
    if (!verifyJwtSignature(parsed.signingInput, parsed.signature, pinned.jwk)) {
      return {
        action: "block",
        failure: {
          reason: "bad_signature",
          detail: "Proof does not verify against the pinned key.",
        },
      };
    }
    return { action: "trusted", keyId: parsed.keyId };
  }

  // First time this key has been seen. The signature can only be checked
  // against the key the proof carried, which proves nothing on its own — an
  // impostor signs its own key just as validly. This is the trust-on-first-use
  // moment, and the same assumption SSH makes on a first connection.
  if (!verifyJwtSignature(parsed.signingInput, parsed.signature, parsed.jwk)) {
    return {
      action: "block",
      failure: { reason: "bad_signature", detail: "Proof is not self-consistent." },
    };
  }

  return { action: "pin", keyId: parsed.keyId, jwk: parsed.jwk };
}

/** 32 bytes, which is what the server echoes back inside the proof. */
export function createClientNonce(random: Uint8Array): string {
  if (random.length !== 32) throw new Error("A client nonce is 32 bytes");
  return base64Url(random);
}

/** Only used by the tests, to build a proof without a server. */
export function proofSigningInput(header: object, payload: object): string {
  return `${base64Url(utf8(JSON.stringify(header)))}.${base64Url(utf8(JSON.stringify(payload)))}`;
}
