/* Scheme memory for a server address. The parsing moved to `@gryt/core`
 * (GRYT-406) and is re-exported here so the eight files importing from
 * `../servers/address` do not have to move.
 *
 * What stayed is below: whether a host answered on http or https. It reaches
 * for storage, the two apps store differently, and `schemeFor` differs from the
 * desktop on purpose.
 */

export {
  normalizeCode,
  normalizeHost,
  parseServerInput,
  type ServerInput,
} from "@gryt/core";

export type Scheme = "http" | "https";

/**
 * The default host for a legacy `/invite/<code>` link.
 *
 * Those links carry no host, and the only client ever served from a path like
 * that is the hosted one.
 */
const DEFAULT_LEGACY_HOST = "app.gryt.chat";

/* ── Which scheme a host is dialled with ──────────────────────────────────
 *
 * **It does not guess.** Every version of guessing from the host leaked, and
 * there is no way to tell `gryt.server` from `gryt.chat` by looking at it.
 * Plain is the default, because a deployment with TLS sits behind a proxy that
 * either redirects the plain request or refuses it — both are answers, both get
 * remembered, so the guess is wrong at most once per server.
 *
 * The client gates this on `canDialPlain()`, false for the web build. **A
 * native app has no such rule**; what it has is App Transport Security, which
 * is `NSAllowsArbitraryLoads` in `app.json` rather than a runtime check.
 *
 * **The map is a cache, not the record.** It is empty at every launch, and
 * while it was the only home for a learned scheme an https server joined
 * yesterday was dialled `ws://` today and the app blamed CORS. The record is a
 * field on `JoinedServer` in `store.ts` (GRYT-499).
 *
 * So `schemeFor`'s default is for a host nothing has been learned *or* stored
 * about. Anything on the connection path resolves the scheme first — see
 * `resolveScheme` in `info.ts`.
 */

const overrides = new Map<string, Scheme>();

/**
 * The hosts a server has replied on *during this run*. **Kept apart from the
 * map**, which answers what to dial — storage cannot vouch for whether anything
 * is there now.
 *
 * The connection's error message turns on that difference: with a stored scheme
 * counting as confirmation, every launch told somebody their dead server had
 * closed the connection (GRYT-522).
 */
const answered = new Set<string>();

/** What to dial for this host, learned or restored. */
export function getRememberedScheme(host: string): Scheme | null {
  return overrides.get(host) ?? null;
}

/** A server answered on this scheme, just now. */
export function rememberScheme(host: string, scheme: Scheme): void {
  overrides.set(host, scheme);
  answered.add(host);
}

/**
 * A scheme carried over from a joined server's storage.
 *
 * Enough to dial with, and deliberately not evidence that anything is up.
 */
export function restoreScheme(host: string, scheme: Scheme): void {
  overrides.set(host, scheme);
}

/** Whether a server has answered this host this run. */
export function schemeConfirmed(host: string): boolean {
  return answered.has(host);
}

export function forgetScheme(host: string): void {
  overrides.delete(host);
  answered.delete(host);
}

/** Read the scheme back off a URL, for recording what actually served a reply. */
export function schemeOfUrl(url: string): Scheme | null {
  if (url.startsWith("https:")) return "https";
  if (url.startsWith("http:")) return "http";
  return null;
}

export function schemeFor(host: string): Scheme {
  return getRememberedScheme(host) ?? "http";
}

/** The other one, for retrying when the first attempt got nowhere. */
export function otherScheme(scheme: Scheme): Scheme {
  return scheme === "https" ? "http" : "https";
}

export function getServerHttpBase(host: string, scheme?: Scheme): string {
  return `${scheme ?? schemeFor(host)}://${host}`;
}

/**
 * The socket's base, following whatever the last `/info` learned. **No retry on
 * the other scheme** — a WebSocket has no redirect to follow, so the answer has
 * to be known before one is opened. The connection resolves a scheme first, so
 * the socket is never what finds out the default was wrong.
 */
export function getServerWsBase(host: string, scheme?: Scheme): string {
  return `${(scheme ?? schemeFor(host)) === "https" ? "wss" : "ws"}://${host}`;
}
