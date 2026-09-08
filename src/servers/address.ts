/* Scheme memory for a server address. The parsing moved to `@gryt/core` and is
 * re-exported so the eight importers do not move; what stayed reaches for storage. */

export {
  normalizeCode,
  normalizeHost,
  parseServerInput,
  type ServerInput,
} from "@gryt/core";

export type Scheme = "http" | "https";

/**
 * The default host for a legacy `/invite/<code>` link. Those links carry no host, and
 * the only client served from such a path is the hosted one.
 */
const DEFAULT_LEGACY_HOST = "app.gryt.chat";

/* ── Which scheme a host is dialled with ──────────────────────────────────
 *
 * **It does not guess**: there is no telling `gryt.server` from `gryt.chat` by looking.
 * Plain is the default, and the redirect or refusal is remembered.
 *
 * **The map is a cache, not the record**, which is a field on `JoinedServer`. Anything
 * on the connection path resolves the scheme first (GRYT-499). */

const overrides = new Map<string, Scheme>();

/**
 * The hosts a server has replied on *during this run*. **Kept apart from the map**,
 * which answers what to dial — storage cannot vouch for whether anything is there
 * now, and counting it told somebody their dead server had closed the connection.
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
 * The socket's base, following whatever the last `/info` learned. **No retry on the
 * other scheme** — a WebSocket has no redirect to follow.
 */
export function getServerWsBase(host: string, scheme?: Scheme): string {
  return `${(scheme ?? schemeFor(host)) === "https" ? "wss" : "ws"}://${host}`;
}
