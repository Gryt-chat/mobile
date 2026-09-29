import type { PairingFetch } from "@gryt/core";
import { formatPairingQr } from "@gryt/crypto";
import { describe, expect, it } from "vitest";

import { createPairingOidc } from "./oidc";
import { gettingHistoryText, gotHistoryLines, newDeviceEndText, renewedText } from "./newDeviceWords";
import { qrPath } from "./qrPath";

const ISSUER = "https://auth.gryt.chat/realms/gryt/";

function fakeFetch(replies: { status: number; body: unknown }[]) {
  const calls: { url: string; body: string; type?: string }[] = [];
  const fetch: PairingFetch = async (url, init) => {
    calls.push({ url, body: init.body ?? "", type: init.headers?.["content-type"] });
    const reply = replies.shift();
    if (!reply) throw new Error("offline");
    return { status: reply.status, json: async () => reply.body };
  };
  return { fetch, calls };
}

describe("the device grant against Keycloak", () => {
  it("asks for a device code with PKCE and the pairing's nonce", async () => {
    const { fetch, calls } = fakeFetch([
      { status: 200, body: { device_code: "dc", user_code: "WXYZ-ABCD", expires_in: 300, interval: 5 } },
    ]);
    const auth = await createPairingOidc(fetch).deviceAuthorization({
      issuer: ISSUER,
      clientId: "gryt-web",
      scope: "openid profile email offline_access",
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      nonce: "kc+/=",
    });
    expect(auth).toEqual({ deviceCode: "dc", userCode: "WXYZ-ABCD", expiresIn: 300, interval: 5 });
    expect(calls[0].url).toBe("https://auth.gryt.chat/realms/gryt/protocol/openid-connect/auth/device");
    expect(calls[0].type).toBe("application/x-www-form-urlencoded");
    const sent = new URLSearchParams(calls[0].body);
    expect(Object.fromEntries(sent)).toEqual({
      client_id: "gryt-web",
      scope: "openid profile email offline_access",
      code_challenge: "challenge",
      code_challenge_method: "S256",
      nonce: "kc+/=",
    });
  });

  it("says why Keycloak refused, rather than handing core a half-empty answer", async () => {
    const { fetch } = fakeFetch([{ status: 400, body: { error: "unauthorized_client" } }]);
    await expect(
      createPairingOidc(fetch).deviceAuthorization({
        issuer: ISSUER,
        clientId: "gryt-web",
        scope: "openid",
        codeChallenge: "c",
        codeChallengeMethod: "S256",
        nonce: "n",
      }),
    ).rejects.toThrow("unauthorized_client");
  });

  it("reads each answer from the token endpoint", async () => {
    const { fetch, calls } = fakeFetch([
      { status: 400, body: { error: "authorization_pending" } },
      { status: 400, body: { error: "slow_down" } },
      { status: 400, body: { error: "access_denied" } },
      { status: 400, body: { error: "expired_token" } },
      { status: 200, body: { id_token: "id", access_token: "at", refresh_token: "rt", expires_in: 300 } },
    ]);
    const oidc = createPairingOidc(fetch);
    const poll = () => oidc.deviceToken({ issuer: ISSUER, clientId: "gryt-web", deviceCode: "dc", codeVerifier: "v" });
    expect(await poll()).toEqual({ status: "pending" });
    expect(await poll()).toEqual({ status: "slow_down" });
    expect(await poll()).toEqual({ status: "denied" });
    expect(await poll()).toEqual({ status: "expired" });
    expect(await poll()).toEqual({ status: "ok", tokens: { idToken: "id", accessToken: "at", refreshToken: "rt", expiresIn: 300 } });
    // The network dropping out is one more poll, not the end.
    expect(await poll()).toEqual({ status: "pending" });
    expect(Object.fromEntries(new URLSearchParams(calls[0].body))).toEqual({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: "gryt-web",
      device_code: "dc",
      code_verifier: "v",
    });
  });
});

describe("the QR and the words around it", () => {
  it("draws a pairing code as a small alphanumeric QR", () => {
    const qr = formatPairingQr({ sessionId: new Uint8Array(16).fill(7), publicKey: new Uint8Array(32).fill(1) });
    const { size, path } = qrPath(qr);
    // Version 4 at level M holds 90 alphanumeric characters: 33 modules a side.
    expect(size).toBe(33);
    expect(path.startsWith("M0 0h1v1h-1z")).toBe(true);
  });

  it("only mentions a renewed code when the other device let it run out", () => {
    expect(renewedText(undefined)).toBeNull();
    expect(renewedText("expired")).toBeNull();
    expect(renewedText("timed_out")).toMatch(/new code/);
  });

  it("has words for every way a link can end", () => {
    expect(newDeviceEndText("cancelled")).toBeNull();
    for (const reason of ["cancelled_by_other", "mismatch", "tampered", "wrong_account", "sign_in_failed", "newer_version", "rate_limited", "relay_error", "expired", "history_failed", "access_denied", "expired_token"] as const) {
      expect(newDeviceEndText(reason)).toMatch(/\.$/);
    }
    expect(newDeviceEndText("history_failed")).toBe(
      "You're linked, but this device couldn't save your message history. Link again from the other device to get it.",
    );
  });

  it("says how the history is coming in, and how far back it got", () => {
    const base = { messages: 0, total: null, chunks: 0, listed: 0, missing: 0, refused: 0, truncated: false, oldest: null, complete: false };
    const date = (at: number) => `day ${at}`;
    expect(gettingHistoryText({ ...base, messages: 12, total: 40 })).toBe("Getting your message history: 12 of 40");
    expect(gettingHistoryText({ ...base, messages: 12 })).toBe("Getting your message history: 12 so far");
    expect(gettingHistoryText({ ...base, messages: 9, total: 8 })).toBe("Getting your message history: 9 of 9");
    expect(gotHistoryLines({ ...base, messages: 40, oldest: 7, complete: true }, date)).toEqual(["Your message history goes back to day 7."]);
    expect(gotHistoryLines({ ...base, messages: 40, oldest: 7, truncated: true, missing: 1, refused: 2, complete: true }, date)).toEqual([
      "The oldest messages didn't fit, so your history starts on day 7.",
      "3 batches of messages couldn't be downloaded.",
    ]);
    expect(gotHistoryLines({ ...base, complete: true }, date)).toEqual([]);
  });
});
