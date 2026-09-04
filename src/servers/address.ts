/* Scheme memory for a server address.
 *
 * The parsing moved to `@gryt/core` (GRYT-406). This file said for months that
 * `normalizeHost`, `normalizeCode` and `parseServerInput` were a copy of the
 * desktop's, kept in step by hand. They were byte for byte identical when the
 * move happened, so nothing had to be reconciled.
 *
 * Re-exported here so the eight files importing from `../servers/address` do
 * not all have to move.
 *
 * What stayed is below: whether a host answered on http or https, and
 * remembering that. It reaches for storage, the two apps store differently, and
 * `schemeFor` differs from the desktop on purpose — see the note on it.
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
 * The client's comment on this is worth keeping: it used to guess from the
 * host — loopback, the RFC1918 ranges, `.local`, everything else secure — and
 * every version of that guess leaked. There is no way to tell `gryt.server`
 * from `gryt.chat` by looking at it.
 *
 * So it does not guess. Plain is the default, because Gryt's server has no TLS
 * of its own and a deployment that has it sits behind a proxy that will either
 * redirect the plain request or refuse it. Both are answers, and both get
 * remembered, so the guess is wrong at most once per server.
 *
 * The client gates this on `canDialPlain()`, which is false for the web build:
 * an https page cannot open http to anything but loopback. **A native app has
 * no such rule**, so this build is always allowed to, exactly like Electron.
 * What it has instead is App Transport Security, which is configuration rather
 * than a runtime check — see `NSAllowsArbitraryLoads` in `app.json`.
 *
 * **The map is a cache, not the record.** It is empty at every launch, and for
 * a while that was the only place a learned scheme lived — so an https server
 * joined yesterday was dialled `ws://` today, the transport died, and the app
 * blamed CORS. What a server answered on is now a field on `JoinedServer` in
 * `store.ts`, written when you join and read back into this map before anything
 * dials. GRYT-499.
 *
 * So `schemeFor`'s default is for a host nothing has been learned about *and*
 * nothing has been stored for — a server being looked at for the first time.
 * Anything on the connection path resolves the scheme first rather than taking
 * the default: see `resolveScheme` in `info.ts`.
 */

const overrides = new Map<string, Scheme>();

/**
 * The hosts a server has replied on *during this run*.
 *
 * Kept apart from the map because the two answer different questions. The map
 * answers what to dial, and a scheme read back out of storage is a good answer
 * to that — it is what the server served last time, and servers do not change
 * scheme often. Whether anything is there *now* is not something storage can
 * vouch for.
 *
 * The connection's error message turns on that difference, which is why the
 * distinction exists at all: with a stored scheme counting as confirmation,
 * every launch after the first told somebody their dead server had closed the
 * connection and might be refusing this app's origin. Nothing had closed
 * anything. GRYT-522.
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
 * The socket's base, which follows whatever the last `/info` learned.
 *
 * There is no retry on the other scheme here, and that is the point of
 * remembering: a WebSocket has no redirect to follow, so by the time one is
 * opened the answer has to already be known. `fetchServerInfo` is what learns
 * it, from the reply rather than from the request.
 *
 * The scheme can be passed in, and the connection passes it: it resolves one
 * before it opens anything, so that the socket is never the thing that finds
 * out the default was wrong.
 */
export function getServerWsBase(host: string, scheme?: Scheme): string {
  return `${(scheme ?? schemeFor(host)) === "https" ? "wss" : "ws"}://${host}`;
}
