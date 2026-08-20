import type { Socket } from "socket.io-client";

import { signAssertion } from "../identity/certificate";
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

export async function joinServer(
  socket: Socket,
  host: string,
  opts: { nickname: string; inviteCode?: string },
): Promise<JoinedPayload> {
  const challenge = await step<ChallengePayload>(
    socket,
    "server:challenge",
    () => socket.emit("server:join", { nickname: opts.nickname, inviteCode: opts.inviteCode }),
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

  /**
   * Whether this server takes a member with no account behind them.
   *
   * A missing `identityTiers` is an older server, which predates the choice and
   * only ever meant accounts. Absent is not permissive.
   */
  const tiers = challenge.identityTiers;
  if (tiers && !tiers.includes("local")) {
    throw new JoinError(
      "This server requires a Gryt account, and this app cannot sign in to one yet.",
      "account_required",
    );
  }
  if (!tiers) {
    throw new JoinError(
      "This server is too old to accept a guest identity.",
      "account_required",
    );
  }

  const identity = await getLocalIdentity(host);
  const assertion = signAssertion(identity, challenge.serverHost, challenge.nonce);

  return step<JoinedPayload>(socket, "server:joined", () =>
    socket.emit("server:verify", { certificate: identity.certificate, assertion }),
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
