import type { Socket } from "socket.io-client";

import { signAssertion } from "../identity/certificate";
import { chooseTier } from "./tier";
import { getLocalIdentity } from "../identity/localIdentity";
import type { ChallengePayload, JoinedPayload } from "./types";

/**
 * The four-message join, which is the only way to see anything on a server.
 *
 * ```
 * C→S server:join      { nickname, inviteCode? }
 * S→C server:challenge { nonce, serverHost, identityTiers }
 * C→S server:verify    { certificate, assertion }
 * S→C server:joined    { accessToken, refreshToken, ... }
 * ```
 *
 * There is no HTTP endpoint for any of this and no anonymous read path —
 * `server:details` is gated on having joined, so a socket that skips this gets
 * `{error: "join_required"}` and nothing else.
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
 * The account certificate to present, if there is one to present.
 *
 * Passed in rather than fetched here: getting one needs a Keycloak token and a
 * round trip to the identity service, and a join that quietly does network
 * calls of its own is a join that fails for reasons the caller cannot see. The
 * caller decides whether it has an account; this decides whether the server
 * will take it.
 */
export interface AccountCertificate {
  certificate: string;
  /** The subject the certificate carries, which the assertion must then claim. */
  sub: string;
}

export async function joinServer(
  socket: Socket,
  host: string,
  options: { nickname: string; inviteCode?: string; accountCertificate?: AccountCertificate },
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

  return step<JoinedPayload>(socket, "server:joined", () =>
    socket.emit("server:verify", { certificate, assertion }),
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
