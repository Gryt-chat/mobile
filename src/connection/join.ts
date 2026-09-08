import type { Socket } from "socket.io-client";

import { signAssertion, signIdentityLink } from "../identity/certificate";
import { chooseTier } from "./tier";
import { getLocalIdentity } from "../identity/localIdentity";
import type { ChallengePayload, JoinedPayload } from "./types";

/**
 * The four-message join — `server:join`, `server:challenge`, `server:verify`,
 * `server:joined` — and **there is no HTTP endpoint and no anonymous read path.**
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
 * fetched here**: a join that makes network calls of its own fails opaquely.
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
   * Whether this account may take over the guest membership this device holds here.
   * **The proof is the disclosure**, so this is false unless somebody said yes —
   * sending it unasked links every server this device has been a guest on (GRYT-502).
   */
  claimPriorMembership?: boolean;
  /**
   * Which identity actually went on the wire. **Reported rather than returned**: a
   * guest join refused at the door still presented a guest key.
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
   * The host in the challenge has to be the host actually dialled, or a server in
   * the middle collects an assertion it can replay somewhere else.
   */
  if (!hostMatches(challenge.serverHost, host)) {
    throw new JoinError(
      `This server asked to be signed in to as "${challenge.serverHost}", which is not the address that was dialled.`,
      "host_mismatch",
    );
  }

  /* Which identity to present. See `tier.ts` — the cases are about what the server
   * admits crossed with whether there is an account. */
  const choice = chooseTier({
    tiers: challenge.identityTiers,
    signedIn: Boolean(options.accountCertificate),
  });
  if ("refuse" in choice) throw new JoinError(choice.refuse, choice.code);

  options.onIdentityUsed?.(choice.tier);

  /* The device key answers the challenge either way. An account certificate vouches
   * for that same key rather than replacing it. */
  const identity = await getLocalIdentity(host);

  const account = choice.tier === "account" ? options.accountCertificate : undefined;
  const certificate = account?.certificate ?? identity.certificate;
  const sub = account?.sub ?? identity.sub;

  const assertion = signAssertion(
    { sub, privateKey: identity.privateKey },
    challenge.serverHost,
    challenge.nonce,
  );

  /* Claim the membership this device already had here. **Only an account can claim,
   * and only ever a local identity** — otherwise swapping identities sheds a ban.
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
 * `server:host` and the address dialled are the same machine, not necessarily the
 * same string — a proxy can present the name without the port. Compare hostnames.
 */
function hostMatches(claimed: string, dialled: string): boolean {
  if (claimed === dialled) return true;
  const bare = (h: string) => h.replace(/:\d+$/, "").toLowerCase();
  return bare(claimed) === bare(dialled);
}

/**
 * Emit something and wait for one of two replies. `server:error` is always the other
 * one, or a refusal is indistinguishable from the server not answering.
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
