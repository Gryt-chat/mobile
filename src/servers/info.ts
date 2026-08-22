import {
  getRememberedScheme,
  getServerHttpBase,
  normalizeHost,
  otherScheme,
  rememberScheme,
  schemeFor,
  schemeOfUrl,
  type Scheme,
} from "./address";

/**
 * What a server says about itself before anybody has joined it.
 *
 * The shape is the server's `/info` response, verbatim. Everything past `name`
 * and `members` is optional because it is answered by servers of different
 * ages: a field that is absent is not a field that is false. An older server
 * sends no `identityTiers` at all, and claiming "no account needed" on that
 * basis is a guess that turns into a refusal at the door.
 */
export interface ServerInfo {
  serverId?: string;
  name: string;
  description?: string;
  /** A string, because that is what the server sends. */
  members: string;
  lanOpen?: boolean;
  identityTiers?: ("account" | "local")[];
  joinPolicy?: "invite" | "request" | "open";
}

/**
 * Give up on /info after this long.
 *
 * Without a deadline the fetch runs until the OS gives up on the TCP connect,
 * which is over a minute — a minute of a spinner with nothing explaining it. A
 * server that advertises an address it does not listen on, which the dev
 * servers do by binding loopback while announcing their hostname, hits this
 * every time.
 */
export const INFO_TIMEOUT_MS = 8000;

export type InfoResult =
  /** The server answered. */
  | { kind: "info"; info: ServerInfo }
  /** Public info is switched off. Joining may still work with a code. */
  | { kind: "private" }
  /** Superseded by a newer lookup — the newer one owns the UI now. */
  | { kind: "superseded" }
  | { kind: "error"; message: string };

/**
 * Ask a server to describe itself.
 *
 * Ported from the desktop client's `fetchServerInfo`, including the retry on
 * the other scheme and the reason for it. Both clients have to read the same
 * server the same way.
 */
export async function fetchServerInfo(
  host: string,
  signal?: AbortSignal,
): Promise<InfoResult> {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return { kind: "error", message: "No address" };

  const controller = new AbortController();
  const abortOuter = () => controller.abort();
  signal?.addEventListener("abort", abortOuter);

  // Distinguishes "we gave up" from "a newer request replaced this one", which
  // the abort alone cannot tell apart.
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, INFO_TIMEOUT_MS);

  try {
    // Plain is the default, so the first attempt at an unknown server is http.
    const first: Scheme = schemeFor(normalizedHost);

    let res: Response;
    try {
      res = await fetch(`${getServerHttpBase(normalizedHost, first)}/info`, {
        signal: controller.signal,
      });
    } catch (reachErr) {
      // Nothing answered. That says nothing about which scheme was wanted, so
      // try the other rather than giving up. Only a transport failure retries:
      // a server that replied with an error has been reached, and dialling it
      // again differently would just be noise.
      if (controller.signal.aborted) throw reachErr;
      res = await fetch(
        `${getServerHttpBase(normalizedHost, otherScheme(first))}/info`,
        { signal: controller.signal },
      );
    }

    // Recorded from the reply rather than from what was asked for, because a
    // proxy on port 80 answers a plain request with a redirect to https and
    // `fetch` follows it. That succeeds while proving the opposite of what was
    // guessed, and the WebSocket has no redirect to follow later.
    const served = schemeOfUrl(res.url);
    if (served) rememberScheme(normalizedHost, served);

    if (res.status === 404) return { kind: "private" };
    if (!res.ok) {
      return { kind: "error", message: `Server responded with ${res.status}` };
    }

    return { kind: "info", info: (await res.json()) as ServerInfo };
  } catch (err: unknown) {
    // React Native rejects an aborted fetch with an AbortError-named Error
    // rather than a DOMException, so this checks the name rather than the type.
    if (err instanceof Error && err.name === "AbortError") {
      if (!timedOut) return { kind: "superseded" };
      return {
        kind: "error",
        message:
          "No response from this server. It may be advertising an address it is not reachable on.",
      };
    }

    // A network-layer failure gives you "Network request failed", which
    // describes the call rather than the situation and names no cause a person
    // could act on.
    return {
      kind: "error",
      message: "Could not reach this server. Check the address and try again.",
    };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortOuter);
  }
}

export interface ResolvedScheme {
  /** What to dial. Falls back to plain when nothing answered at all. */
  scheme: Scheme;
  /**
   * True when a server actually answered on it.
   *
   * The connection needs this and not only the scheme. A failure after dialling
   * a scheme the server is known to serve is a different failure from one after
   * dialling a guess, and the app used to report both as "it may be refusing
   * this app's origin" — which was wrong, and unhelpful, on a server that was
   * simply never reached.
   */
  confirmed: boolean;
}

/**
 * How to dial this host, asking the server if nobody knows yet.
 *
 * A WebSocket has no redirect to follow, so the answer has to exist before one
 * is opened. Anything already learned this run — or restored from a joined
 * server's stored scheme — is taken as it is; otherwise `/info` is asked, which
 * tries both schemes and records whichever replied.
 *
 * Nothing answering leaves plain as the answer, deliberately: the socket then
 * fails against the address a person actually typed and the error names the
 * host rather than inventing a cause.
 */
export async function resolveScheme(
  host: string,
  signal?: AbortSignal,
): Promise<ResolvedScheme> {
  const normalizedHost = normalizeHost(host);

  const known = getRememberedScheme(normalizedHost);
  if (known) return { scheme: known, confirmed: true };

  await fetchServerInfo(normalizedHost, signal);

  const learned = getRememberedScheme(normalizedHost);
  return learned
    ? { scheme: learned, confirmed: true }
    : { scheme: "http", confirmed: false };
}
