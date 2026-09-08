import {
  getRememberedScheme,
  getServerHttpBase,
  normalizeHost,
  otherScheme,
  rememberScheme,
  schemeConfirmed,
  schemeFor,
  schemeOfUrl,
  type Scheme,
} from "./address";

/**
 * What a server says about itself before anybody has joined — `/info` verbatim. **A
 * field that is absent is not a field that is false.**
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
 * Give up on /info after this long. Without a deadline the fetch runs until the OS
 * gives up on the TCP connect, which is over a minute of spinner.
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
 * Ask a server to describe itself. Ported from the desktop's `fetchServerInfo`,
 * retry included: both clients have to read the same server the same way.
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
      // Nothing answered, which says nothing about the scheme, so try the other.
      // Only a transport failure retries: an error means the server was reached.
      if (controller.signal.aborted) throw reachErr;
      res = await fetch(
        `${getServerHttpBase(normalizedHost, otherScheme(first))}/info`,
        { signal: controller.signal },
      );
    }

    // Recorded from the reply rather than from what was asked for: a proxy on port
    // 80 redirects to https and `fetch` follows, but a WebSocket cannot.
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

    // A network-layer failure gives "Network request failed", which describes the
    // call rather than the situation.
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
   * True when a server answered on it *this run*. **"This run" is load-bearing**: a
   * scheme restored from storage is a fact about an earlier launch (GRYT-522).
   */
  confirmed: boolean;
}

/**
 * How to dial this host, asking the server if nobody knows yet — a WebSocket has no
 * redirect to follow. **Nothing answering leaves plain as the answer.**
 */
export async function resolveScheme(
  host: string,
  signal?: AbortSignal,
): Promise<ResolvedScheme> {
  const normalizedHost = normalizeHost(host);

  const known = getRememberedScheme(normalizedHost);
  if (known) return { scheme: known, confirmed: schemeConfirmed(normalizedHost) };

  await fetchServerInfo(normalizedHost, signal);

  const learned = getRememberedScheme(normalizedHost);
  return learned
    ? { scheme: learned, confirmed: true }
    : { scheme: "http", confirmed: false };
}
