import type { DeviceTokenPoll, PairingFetch, PairingOidc } from "@gryt/core";

/* The two RFC 8628 calls against Keycloak, for a phone being linked (GRYT-1484). Core makes
   the PKCE verifier and the nonce; this only speaks the wire format. */

const form = (fields: Record<string, string>) =>
  Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

const text = (v: unknown) => (typeof v === "string" && v ? v : null);
const number = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function createPairingOidc(fetch: PairingFetch): PairingOidc {
  const post = async (url: string, fields: Record<string, string>) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: form(fields),
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: res.status, body: body ?? {} };
  };
  const base = (issuer: string) => `${issuer.replace(/\/+$/, "")}/protocol/openid-connect`;

  return {
    async deviceAuthorization(req) {
      const { status, body } = await post(`${base(req.issuer)}/auth/device`, {
        client_id: req.clientId,
        scope: req.scope,
        code_challenge: req.codeChallenge,
        code_challenge_method: req.codeChallengeMethod,
        nonce: req.nonce,
      });
      const deviceCode = text(body.device_code);
      const userCode = text(body.user_code);
      const expiresIn = number(body.expires_in);
      if (status !== 200 || !deviceCode || !userCode || !expiresIn) {
        throw new Error(`Keycloak refused the device authorization: ${text(body.error) ?? status}`);
      }
      return { deviceCode, userCode, expiresIn, interval: number(body.interval) };
    },

    async deviceToken(req): Promise<DeviceTokenPoll> {
      const reply = await post(`${base(req.issuer)}/token`, {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: req.clientId,
        device_code: req.deviceCode,
        code_verifier: req.codeVerifier,
      }).catch(() => null);
      // A dropped poll is another poll in five seconds, not the end of signing in.
      if (!reply) return { status: "pending" };
      const { status, body } = reply;
      const idToken = text(body.id_token);
      const accessToken = text(body.access_token);
      if (status === 200 && idToken && accessToken) {
        const refreshToken = text(body.refresh_token) ?? undefined;
        return { status: "ok", tokens: { idToken, accessToken, refreshToken, expiresIn: number(body.expires_in) } };
      }
      switch (body.error) {
        case "authorization_pending":
          return { status: "pending" };
        case "slow_down":
          return { status: "slow_down" };
        case "expired_token":
          return { status: "expired" };
        default:
          return { status: "denied" };
      }
    },
  };
}
