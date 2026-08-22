import type { Report } from "./report";

/**
 * Sending a report. **Not wired yet, on purpose.**
 *
 * The service is `Gryt-chat/reports` and it exists; joining the two halves is
 * being done separately, so this file is the seam and nothing here guesses at
 * the parts that need a secret or a signature.
 *
 * What the wiring needs, from the service's own README, so it does not have to
 * be looked up again:
 *
 * ```
 * POST https://reports.gryt.chat/v1/reports
 * content-type:    application/json
 * x-gryt-app:      mobile
 * x-gryt-app-key:  <the key this app ships>
 * x-gryt-identity: <optional ES256 JWT, see below>
 * ```
 *
 * `202` with `{ id, receivedAt }` on success. The failures worth telling
 * somebody about are `429` (rate limited, with `Retry-After`) and `413` (too
 * large); the rest are the app's fault rather than theirs and should read as
 * "could not send" rather than as a code.
 *
 * **The app key is friction, not authentication** — the README says so plainly.
 * Every client ships one, anyone can pull it out of a bundle, and what it buys
 * is that a scanner finding an open endpoint cannot fill the table overnight.
 * It should be one key for this app, so a leak can be rotated without shipping
 * the others.
 *
 * **The signature is what authenticates**, and this app already has everything
 * for it. `src/identity/keys.ts` has `signJwt`, `jwkThumbprint` and the P-256
 * derivation; `@noble/hashes` is a dependency. The claims are
 *
 * ```
 * header  { alg: "ES256", jwk: <the public half> }
 * claims  { sub: <RFC 7638 thumbprint of that jwk>,
 *           aud: "gryt:reports",
 *           bh:  <base64url sha256 of the exact request body>,
 *           jti: <once>, iat, exp <= iat + 300 }
 * ```
 *
 * `bh` binds the assertion to the body, which is what replaces the challenge
 * round trip a server join has. Which key to sign with is the one real
 * decision left: the per-server guest keys are deliberately unlinkable from
 * each other, so signing with one of those would tell this service which server
 * the reporter uses. A key derived for this service alone keeps that property.
 */
export interface Submitted {
  id: string;
  receivedAt: string;
}

export class NotWiredError extends Error {
  constructor() {
    super("Sending a report is not connected to the service yet.");
    this.name = "NotWiredError";
  }
}

export async function submitReport(_report: Report): Promise<Submitted> {
  throw new NotWiredError();
}
