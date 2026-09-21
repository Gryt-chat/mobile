/* Scheme memory for a server address. The parsing moved to `@gryt/core` and is
 * re-exported so the eight importers do not move; what stayed reaches for storage. */

import {
  normalizeCode,
  normalizeHost,
  parseServerInput as parseWithCore,
  type ServerInput,
} from "@gryt/core";

export { normalizeCode, normalizeHost, type ServerInput } from "@gryt/core";

export type Scheme = "http" | "https";

/**
 * The default host for a legacy `/invite/<code>` link. Those links carry no host, and
 * the only client served from such a path is the hosted one.
 */
const DEFAULT_LEGACY_HOST = "app.gryt.chat";

/* Core up to 0.6.0 reads a link with a host and no code as gryt.chat itself. Drop this
   once the release with the fix is pinned (GRYT-1300). */
export function parseServerInput(
  input: string,
  opts?: { defaultLegacyHost?: string },
): ServerInput {
  const parsed = parseWithCore(input, opts);
  if (parsed.code) return parsed;

  const raw = String(input || "").trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return parsed;
  try {
    const url = new URL(raw);
    const isInvite = url.pathname.startsWith("/invite") || url.hostname === "invite";
    const host = isInvite ? normalizeHost(url.searchParams.get("host") || "") : "";
    return host ? { host, code: "" } : parsed;
  } catch {
    return parsed;
  }
}

/** A copy of core's `inviteLink` until the release is pinned (GRYT-1300). */
export function inviteLink(host: string, code?: string): string {
  const cleanCode = normalizeCode(code ?? "");
  const query = `host=${encodeURIComponent(normalizeHost(host))}`;
  return `https://gryt.chat/invite?${query}${cleanCode ? `&code=${encodeURIComponent(cleanCode)}` : ""}`;
}

/** Names that only mean something on one network. A bare name with no dot is one too. */
const LOCAL_SUFFIXES = ["localhost", "local", "localdomain", "lan", "home", "internal", "home.arpa"];

/** Lowercased, with any port, brackets and trailing dot removed. */
function bareHostname(host: string): string {
  const trimmed = normalizeHost(host).toLowerCase();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(trimmed);
  if (bracketed) return bracketed[1];
  const colons = (trimmed.match(/:/g) || []).length;
  const withoutPort = colons === 1 ? trimmed.replace(/:\d*$/, "") : trimmed;
  return withoutPort.replace(/\.$/, "");
}

function ipv4Octets(name: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return null;
  const octets = name.split(".").map(Number);
  return octets.every((n) => n <= 255) ? octets : null;
}

function isPublicIpv4([a, b]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT, and Tailscale
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  return !(a === 192 && b === 168);
}

/* Whether an address works for somebody on another network. A copy of core's
   `isPublicHost` until the release is pinned (GRYT-1300). */
export function isPublicHost(host: string): boolean {
  const name = bareHostname(host);
  if (!name) return false;

  const v4 = ipv4Octets(name);
  if (v4) return isPublicIpv4(v4);

  if (name.includes(":")) {
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(name);
    if (mapped) {
      const octets = ipv4Octets(mapped[1]);
      return !!octets && isPublicIpv4(octets);
    }
    if (name === "::" || name === "::1") return false;
    // fc00::/7 is private, fe80::/10 is link-local.
    return !/^f[cd]/.test(name) && !/^fe[89ab]/.test(name);
  }

  // No top-level domain is all digits, so `999.1.1.1` is a broken address rather than a name.
  if (!name.includes(".") || /\.\d+$/.test(name)) return false;
  return !LOCAL_SUFFIXES.some((suffix) => name === suffix || name.endsWith(`.${suffix}`));
}

/* ── Which scheme a host is dialled with ──────────────────────────────────
 *
 * It does not guess; plain is the default and the answer is remembered. The map is a
 * cache — the record is a field on `JoinedServer` — and the path resolves it first. */

const overrides = new Map<string, Scheme>();

/**
 * The hosts a server has replied on during this run, kept apart from the map that says
 * what to dial: storage cannot vouch for what is there now.
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
