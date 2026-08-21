import { describe, expect, it, vi } from "vitest";

import { base64Url, utf8 } from "../identity/encoding";
import type { PublicJwk } from "../identity/keys";
import {
  RENEW_BUFFER_MS,
  describesKey,
  expiryOf,
  isUsable,
  requestCertificate,
  subjectOf,
} from "./certificate";

const KEY: PublicJwk = { kty: "EC", crv: "P-256", x: "XCOORD", y: "YCOORD" };
const OTHER: PublicJwk = { ...KEY, x: "DIFFERENT" };

function cert(payload: Record<string, unknown>): string {
  return [
    base64Url(utf8(JSON.stringify({ alg: "ES256", typ: "JWT" }))),
    base64Url(utf8(JSON.stringify(payload))),
    "not-a-real-signature",
  ].join(".");
}

const NOW = 1_700_000_000_000;
const good = (over: Record<string, unknown> = {}) =>
  cert({ sub: "gryt:account:abc", exp: NOW / 1000 + 30 * 86400, jwk: KEY, ...over });

describe("subjectOf", () => {
  it("reads the subject the assertion will have to claim", () => {
    expect(subjectOf(good())).toBe("gryt:account:abc");
  });

  it("answers null rather than throwing on rubbish", () => {
    expect(subjectOf("not-a-jwt")).toBeNull();
    expect(subjectOf(cert({ exp: 1 }))).toBeNull();
  });
});

describe("expiryOf", () => {
  it("reads exp as milliseconds", () => {
    expect(expiryOf(cert({ exp: 1700 }))).toBe(1_700_000);
  });

  it("answers null when there is none", () => {
    expect(expiryOf(cert({ sub: "x" }))).toBeNull();
  });
});

describe("describesKey", () => {
  it("accepts the key it was issued for", () => {
    expect(describesKey(good(), KEY)).toBe(true);
  });

  /* The case this exists for: a certificate that looks valid, is accepted
   * locally, and is refused by whichever server it reaches. */
  it("rejects a certificate for a different key", () => {
    expect(describesKey(good(), OTHER)).toBe(false);
  });

  it("ignores extra members rather than demanding an exact object", () => {
    expect(describesKey(good({ jwk: { ...KEY, alg: "ES256", key_ops: ["verify"] } }), KEY)).toBe(true);
  });

  it("rejects a certificate carrying no key at all", () => {
    expect(describesKey(cert({ sub: "x", exp: 1 }), KEY)).toBe(false);
    expect(describesKey("not-a-jwt", KEY)).toBe(false);
  });
});

describe("isUsable", () => {
  it("accepts one that is current and for this key", () => {
    expect(isUsable({ certificate: good(), expiresAt: NOW + 10 * 86400_000 }, KEY, NOW)).toBe(true);
  });

  it("renews ahead of expiry rather than at it", () => {
    const justInside = { certificate: good(), expiresAt: NOW + RENEW_BUFFER_MS - 1 };
    expect(isUsable(justInside, KEY, NOW)).toBe(false);
  });

  it("refuses one for another key however fresh", () => {
    expect(isUsable({ certificate: good(), expiresAt: NOW + 10 * 86400_000 }, OTHER, NOW)).toBe(false);
  });

  it("has nothing to say about nothing", () => {
    expect(isUsable(null, KEY, NOW)).toBe(false);
  });
});

describe("requestCertificate", () => {
  const ok = (body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

  it("asks the identity service to vouch for the key it was given", async () => {
    const fetchImpl = ok({ certificate: good() });
    await requestCertificate({
      identityUrl: "https://id.gryt.chat/",
      accessToken: "kc-token",
      publicJwk: KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    // The trailing slash is trimmed, or the path doubles it.
    expect(url).toBe("https://id.gryt.chat/api/v1/certificate");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer kc-token");
    expect(JSON.parse(init.body as string)).toEqual({ jwk: KEY });
  });

  it("returns the certificate and when it expires", async () => {
    const result = await requestCertificate({
      identityUrl: "https://id.gryt.chat",
      accessToken: "kc",
      publicJwk: KEY,
      fetchImpl: ok({ certificate: good() }) as unknown as typeof fetch,
    });
    expect(subjectOf(result.certificate)).toBe("gryt:account:abc");
    expect(result.expiresAt).toBeGreaterThan(NOW);
  });

  it("carries the status through, so a 401 can be told from a 500", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    await expect(
      requestCertificate({
        identityUrl: "https://id.gryt.chat",
        accessToken: "stale",
        publicJwk: KEY,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  /* Trusting this would mean presenting somebody else's certificate and
   * finding out at the far end. */
  it("refuses a certificate for a key it did not ask about", async () => {
    await expect(
      requestCertificate({
        identityUrl: "https://id.gryt.chat",
        accessToken: "kc",
        publicJwk: OTHER,
        fetchImpl: ok({ certificate: good() }) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/different key/);
  });

  it("refuses an answer with no certificate in it", async () => {
    await expect(
      requestCertificate({
        identityUrl: "https://id.gryt.chat",
        accessToken: "kc",
        publicJwk: KEY,
        fetchImpl: ok({ nope: true }) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/without a certificate/);
  });

  it("refuses one with no expiry, since nothing could decide when to renew", async () => {
    await expect(
      requestCertificate({
        identityUrl: "https://id.gryt.chat",
        accessToken: "kc",
        publicJwk: KEY,
        fetchImpl: ok({ certificate: cert({ sub: "s", jwk: KEY }) }) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/no expiry/);
  });
});
