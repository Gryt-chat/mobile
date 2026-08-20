/* Reading whatever somebody pasted into the join field.
 *
 * A port of `parseServerInput`, `normalizeHost`, `normalizeCode` and the scheme
 * helpers from the desktop client's `@/common`. **Ported, not adapted** — the
 * two clients talk to the same servers, and an address this one reads
 * differently is a server one of them cannot join.
 *
 * It is a copy because the client's `common` package is not published. That is
 * a real cost and it is written down in GRYT-406 rather than left to be
 * discovered when the two drift.
 *
 * The one deliberate difference is `schemeFor`, and it is explained there.
 */

export type Scheme = "http" | "https";

export function normalizeHost(input: string): string {
  let h = String(input || "").trim();
  h = h.replace(/^(wss?:\/\/|https?:\/\/)/i, "");
  h = h.split("/")[0] || "";
  h = h.replace(/\s+/g, "");
  return h;
}

export function normalizeCode(input: string): string {
  return String(input || "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

/**
 * The default host for a legacy `/invite/<code>` link.
 *
 * Those links carry no host, and the only client ever served from a path like
 * that is the hosted one.
 */
const DEFAULT_LEGACY_HOST = "app.gryt.chat";

export interface ServerInput {
  /** Empty when nothing usable was in the input. */
  host: string;
  /** Empty for a plain address, which carries no code. */
  code: string;
}

/**
 * Three shapes arrive and they are not the same thing: a full invite link
 * (`https://gryt.chat/invite?host=…&code=…`), a legacy one
 * (`https://app.gryt.chat/invite/<code>`), and a plain address (`gryt.chat`,
 * `192.168.1.5:5001`).
 *
 * `normalizeHost` on its own is wrong for the first two — it returns the
 * *link's* host, which is gryt.chat, and joining that instead of the server
 * named in the query is a confusing failure rather than an obvious one.
 *
 * Anything that does not parse as a link falls through to being an address, so
 * a typo in a URL still gets the address treatment rather than an error about
 * invite formats.
 */
export function parseServerInput(
  input: string,
  opts?: { defaultLegacyHost?: string },
): ServerInput {
  const raw = String(input || "").trim();
  if (!raw) return { host: "", code: "" };

  const legacyHost = normalizeHost(opts?.defaultLegacyHost || DEFAULT_LEGACY_HOST);

  // Only something carrying a scheme can be a link. Without this, `gryt.chat`
  // parses as a URL in some engines with "gryt.chat" as the protocol.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const path = url.pathname || "/";
      // gryt://invite?host=…&code=… puts "invite" in the authority rather than
      // the path, because the scheme is not one the URL parser treats as
      // special. Both spellings mean the same thing.
      const isInvite = path.startsWith("/invite") || url.hostname === "invite";

      if (isInvite) {
        const host = normalizeHost(url.searchParams.get("host") || "");
        const code = normalizeCode(url.searchParams.get("code") || "");
        if (host && code) return { host, code };

        const parts = path.split("/").filter(Boolean);
        if (parts[0] === "invite" && parts[1]) {
          return { host: legacyHost, code: normalizeCode(parts[1]) };
        }
      }
    } catch {
      // Not a URL after all. It is still probably an address.
    }
  }

  return { host: normalizeHost(raw), code: "" };
}

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
 */

const overrides = new Map<string, Scheme>();

/** What actually answered for this host, if anything ever has. */
export function getRememberedScheme(host: string): Scheme | null {
  return overrides.get(host) ?? null;
}

export function rememberScheme(host: string, scheme: Scheme): void {
  overrides.set(host, scheme);
}

export function forgetScheme(host: string): void {
  overrides.delete(host);
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
