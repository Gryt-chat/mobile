import type { Socket } from "socket.io-client";

import { signAssertion, signIdentityLink } from "../identity/certificate";
import { chooseTier } from "./tier";
import { getLocalIdentity } from "../identity/localIdentity";
import type { ChallengePayload, JoinedPayload } from "./types";

/**
 * The four-message join, the only way to see anything on a server.
 *
 * ```
 * C→S server:join      { nickname, inviteCode? }
 * S→C server:challenge { nonce, serverHost, identityTiers }
 * C→S server:verify    { certificate, assertion }
 * S→C server:joined    { accessToken, refreshToken, ... }
 * ```
 *
 * **No HTTP endpoint and no anonymous read path.** A socket that skips this
 * gets `{error: "join_required"}` and nothing else.
 */

export class JoinError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "JoinError";
  }
}

/** How long to wait for each half of the exchange before giving up. */
const STEP_TIMEOUT_MS = 15_000;

/**
 * The account certificate to present, if there is one. **Passed in rather than
 * fetched here** — a join that quietly makes network calls of its own fails for
 * reasons the caller cannot see.
 */
export interface AccountCertificate {
  certificate: string;
  /** The subject the certificate carries, which the assertion must then claim. */
  sub: string;
}

export interface JoinOptions {
  nickname: string;
  inviteCode?: string;
  accountCertificate?: AccountCertificate;
  /**
   * Whether this account has been given permission to take over the guest
   * membership this device holds here.
   *
   * Passed in, and false unless somebody has said yes. This used to be sent on
   * every account-tier join, on the reasoning that the server answers
   * `no_prior_membership` when there is nothing to carry.
   *
   * That reasoning misses the client's side: **the proof is the disclosure.**
   * Signing it tells the server the account and the guest are the same person,
   * and nothing later can take that back — so a join that sends it unasked has
   * already linked every server this device has ever been a guest on, to an
   * account, without anybody choosing that. GRYT-285 on the desktop, GRYT-502
   * here.
   *
   * The caller decides, for the same reason it decides `accountCertificate`: a
   * join that quietly reads things of its own is a join that fails for reasons
   * the caller cannot see.
   */
  claimPriorMembership?: boolean;
  /**
   * Which identity actually went on the wire. **Reported rather than returned**,
   * because a guest join refused at the door still means this device presented
   * a guest key here.
   */
  onIdentityUsed?: (tier: "account" | "local") => void;
}

export async function joinServer(
  socket: Socket,
  host: string,
  options: JoinOptions,
): Promise<JoinedPayload> {
  const challenge = await step<ChallengePayload>(
    socket,
    "server:challenge",
    () => socket.emit("server:join", { nickname: options.nickname, inviteCode: options.inviteCode }),
  );

  /**
   * The host in the challenge has to be the host actually dialled.
   *
   * Signing an assertion for a host you did not dial is how a server in the
   * middle collects one it can replay somewhere else. The desktop client checks
   * the same thing before it will sign.
   */
  if (!hostMatches(challenge.serverHost, host)) {
    throw new JoinError(
      `This server asked to be signed in to as "${challenge.serverHost}", which is not the address that was dialled.`,
      "host_mismatch",
    );
  }

  /* Which identity to present. See `tier.ts` — the cases are all about what
   * the server admits crossed with whether there is an account, and none of
   * them are about the socket. */
  const choice = chooseTier({
    tiers: challenge.identityTiers,
    signedIn: Boolean(options.accountCertificate),
  });
  if ("refuse" in choice) throw new JoinError(choice.refuse, choice.code);

  options.onIdentityUsed?.(choice.tier);

  /* The device key answers the challenge either way. An account certificate
   * vouches for that same key — it does not replace it — so the only thing
   * that changes between the tiers is which certificate goes on the wire and,
   * with it, which subject the assertion has to claim. */
  const identity = await getLocalIdentity(host);

  const account = choice.tier === "account" ? options.accountCertificate : undefined;
  const certificate = account?.certificate ?? identity.certificate;
  const sub = account?.sub ?? identity.sub;

  const assertion = signAssertion(
    { sub, privateKey: identity.privateKey },
    challenge.serverHost,
    challenge.nonce,
  );

  /* Claim the membership this device already had here.
   *
   * **Only an account can claim, and only ever a local identity** — letting one
   * local identity claim another makes swapping between them a way to shed a
   * ban. The server enforces it; this never sends a link on the local path.
   *
   * **And only on an explicit yes**: the proof is the disclosure. */
  const link =
    account && options.claimPriorMembership
      ? signIdentityLink(identity, challenge.serverHost, challenge.nonce, account.sub)
      : undefined;

  return step<JoinedPayload>(socket, "server:joined", () =>
    socket.emit("server:verify", { certificate, assertion, link }),
  );
}

/**
 * `server:host` and the address dialled are the same machine, but not
 * necessarily the same string — a proxy can present the name without the port
 * a client used. Comparing hostnames is what the client does.
 */
function hostMatches(claimed: string, dialled: string): boolean {
  if (claimed === dialled) return true;
  const bare = (h: string) => h.replace(/:\d+$/, "").toLowerCase();
  return bare(claimed) === bare(dialled);
}

/**
 * Emit something and wait for one of two replies.
 *
 * `server:error` is always the other one. Without listening for it a refusal —
 * a missing invite, a rate limit — is indistinguishable from the server not
 * answering, and the user waits fifteen seconds to be told nothing.
 */
function step<T>(socket: Socket, event: string, send: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const done = (fn: () => void) => {
      clearTimeout(timer);
      socket.off(event, onOk);
      socket.off("server:error", onErr);
      fn();
    };

    const onOk = (payload: T) => done(() => resolve(payload));

    const onErr = (payload: { error?: string; message?: string }) =>
      done(() =>
        reject(
          new JoinError(
            payload?.message || payload?.error || "The server refused the join.",
            payload?.error || "server_error",
          ),
        ),
      );

    const timer = setTimeout(
      () => done(() => reject(new JoinError("The server stopped answering.", "timeout"))),
      STEP_TIMEOUT_MS,
    );

    socket.on(event, onOk);
    socket.on("server:error", onErr);
    send();
  });
}
