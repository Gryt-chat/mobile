import { verifyDmKeyBinding, asIdentityScope } from "@gryt/crypto";
import { describe, expect, it, vi } from "vitest";

/**
 * The phone and the laptop have to arrive at the same keys (GRYT-732).
 *
 * One person's DM key on one server is one key — derived from the seed both
 * devices hold — and what a peer pins is that key plus the thumbprint of
 * whatever vouched for it. If the two clients disagree about either, the peer
 * sees a substituted key every time the other device publishes and refuses to
 * encrypt, which is the correct response to what it can see and a bug either
 * way.
 *
 * The values below were produced by the desktop client, by running its
 * `identity-seed.ts` and `@gryt/crypto` against this seed and this scope.
 * Nothing here regenerates them. If one fails, the two clients have drifted and
 * the fix is not to update the vector.
 *
 * The binding *string* is deliberately not compared. WebCrypto's `exportKey`
 * adds `ext` and `key_ops` to a JWK and this app's derivation does not, so the
 * headers differ and the signatures over them differ with it. Neither reaches a
 * pin: a thumbprint is taken over `crv`, `kty`, `x` and `y` and nothing else,
 * which is what makes the two comparable at all.
 */

const seed = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) % 251);
const DM_SCOPE = "srv:abc123def456";

/** From the desktop client. See the note above. */
const DESKTOP = {
  identityJwk: {
    kty: "EC",
    crv: "P-256",
    x: "YriPRnWcjHdrsJyhpu_tDRPuHlJ5kgqZMOpN-IS639U",
    y: "fLKqB3nfR_qgxhaF29GlxalPqRxIkv5SP9QlxJYprNg",
  },
  dmPublicKey: "fOxItwlNsdJacEPFm3SpE00Z8GaV7A9uQqERrEYgK3U",
  binding:
    "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImp3ayI6eyJrZXlfb3BzIjpbInZlcmlmeSJdLCJleHQiOnRydWUsImt0eSI6IkVDIiwieCI6IllyaVBSbldjakhkcnNKeWhwdV90RFJQdUhsSjVrZ3FaTU9wTi1JUzYzOVUiLCJ5IjoiZkxLcUIzbmZSX3FneGhhRjI5R2x4YWxQcVJ4SWt2NVNQOVFseEpZcHJOZyIsImNydiI6IlAtMjU2In19.eyJpc3MiOiJncnl0OmRtLWtleSIsInNjb3BlIjoic3J2OmFiYzEyM2RlZjQ1NiIsImRtIjoiZk94SXR3bE5zZEphY0VQRm0zU3BFMDBaOEdhVjdBOXVRcUVSckVZZ0szVSIsImlhdCI6MTczNTY4OTYwMH0.2ZSzf6jKDA7wzlyXUC-6iGBfy7OkWEV7rmakRp68tjT89x_9uksdvZqfINnyb0RimVGqruz3cs47Besgzgg2gQ",
};

vi.mock("./seed", () => ({
  getOrCreateSeed: async () => seed,
}));

const { deriveLocalKeyPair } = await import("./keys");
const { dmKeyBindingFor, dmKeyPairFor, ownDmPublicKey } = await import("./dmKeys");

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

describe("against the desktop client", () => {
  it("derives the same DM public key", async () => {
    expect(b64(await ownDmPublicKey(DM_SCOPE))).toBe(DESKTOP.dmPublicKey);
  });

  it("derives the same identity key from the lineage scope", async () => {
    // Not `identityScopeFor(host)`, which is the address here and the lineage
    // there. Signing a binding with the join key would guarantee the flip this
    // whole file exists to rule out.
    const { publicJwk } = deriveLocalKeyPair(seed, DM_SCOPE);
    expect(publicJwk).toEqual(DESKTOP.identityJwk);
  });

  it("produces a binding with the same thumbprint and the same key", async () => {
    const scope = asIdentityScope(DM_SCOPE);

    const mine = await verifyDmKeyBinding(await dmKeyBindingFor(DM_SCOPE), scope);
    const theirs = await verifyDmKeyBinding(DESKTOP.binding, scope);

    // The pair a peer pins, and the whole of what has to agree.
    expect(mine.identityThumbprint).toBe(theirs.identityThumbprint);
    expect(b64(mine.dmPublicKey)).toBe(b64(theirs.dmPublicKey));
  });

  it("opens the desktop's binding, which is the check a peer runs", async () => {
    const verified = await verifyDmKeyBinding(
      DESKTOP.binding,
      asIdentityScope(DM_SCOPE),
    );
    expect(b64(verified.dmPublicKey)).toBe(DESKTOP.dmPublicKey);
  });
});

describe("the binding this app signs", () => {
  it("verifies against the scope it names", async () => {
    const binding = await dmKeyBindingFor(DM_SCOPE);
    const verified = await verifyDmKeyBinding(binding, asIdentityScope(DM_SCOPE));

    expect(b64(verified.dmPublicKey)).toBe(DESKTOP.dmPublicKey);
  });

  it("is refused under any other scope", async () => {
    // A binding replayed onto a second server would let that server's operator
    // present it as a member's key there. The scope is inside what was signed,
    // so it cannot be moved.
    const binding = await dmKeyBindingFor(DM_SCOPE);
    await expect(
      verifyDmKeyBinding(binding, asIdentityScope("srv:somewhere-else")),
    ).rejects.toThrow(/different server/i);
  });

  it("signs r‖s, not DER", async () => {
    // The other thing `p256.sign` could plausibly return is DER — about 70
    // bytes, starting 0x30 — and every verifier would refuse it. The signature
    // is the last segment.
    const binding = await dmKeyBindingFor(DM_SCOPE);
    const signature = Buffer.from(binding.split(".")[2], "base64url");

    expect(signature.length).toBe(64);
  });

  it("gives the private half only through the keypair", async () => {
    const pair = await dmKeyPairFor(DM_SCOPE);
    expect(pair.privateKey.length).toBe(32);
    expect(b64(pair.publicKey)).toBe(DESKTOP.dmPublicKey);
  });
});
