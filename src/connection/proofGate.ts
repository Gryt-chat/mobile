/**
 * Holds `fetch` calls that carry a bearer token to a Gryt server until a socket to that
 * server has proved its identity (GRYT-1548). `guardSocket` tells it; `fetch` asks.
 */

/** How long a request waits for a proof before it fails the way a dead server would. */
export const PROOF_WAIT_MS = 15_000;

interface HostState {
  /** Connections to this host that proved themselves and are still open. */
  proved: Set<object>;
  /** The last guard to settle refused it, and nothing proved since. */
  refused: boolean;
  waiters: Set<{ resolve: () => void; reject: (err: Error) => void }>;
}

const hosts = new Map<string, HostState>();

/* By hand rather than `new URL`: React Native's URL reads the hostname with a regex that
 * keeps the case and breaks on IPv6, and the keys have to match exactly. */
function keyOfAuthority(authority: string): string | null {
  const at = authority.lastIndexOf("@");
  const hostPort = (at >= 0 ? authority.slice(at + 1) : authority).toLowerCase();
  const match = /^(\[[^\]]+\]|[^:[\]]+)(?::(\d*))?$/.exec(hostPort);
  if (!match || !match[1]) return null;
  const port = match[2] ?? "";
  // Default ports dropped, so "example.com:443" and an https URL agree.
  return `${match[1]}:${port === "80" || port === "443" ? "" : port}`;
}

function keyOfHost(host: string): string | null {
  return keyOfAuthority(host.trim());
}

function keyOfUrl(input: string): string | null {
  const match = /^https?:\/\/([^/?#]*)/i.exec(input.trim());
  return match ? keyOfAuthority(match[1]) : null;
}

function stateFor(host: string): HostState | null {
  const key = keyOfHost(host);
  if (!key) return null;
  let state = hosts.get(key);
  if (!state) {
    state = { proved: new Set(), refused: false, waiters: new Set() };
    hosts.set(key, state);
  }
  return state;
}

const notProved = (key: string | null) =>
  new Error(`${key ?? "That server"} has not proved its identity, so nothing that carries your token goes to it.`);

/** A guard now looks after this host, so bearer requests to it wait for a proof. */
export function watchHost(host: string): void {
  installProofGate();
  const state = stateFor(host);
  // A new guard is a new attempt, so requests wait for it rather than failing on the last refusal.
  if (state) state.refused = false;
}

export function markProved(host: string, connection: object): void {
  const state = stateFor(host);
  if (!state) return;
  state.proved.add(connection);
  state.refused = false;
  for (const w of state.waiters) w.resolve();
  state.waiters.clear();
}

/** The connection went. Requests after this wait for the next one to prove itself. */
export function markGone(host: string, connection: object): void {
  stateFor(host)?.proved.delete(connection);
}

/** True when nothing to this host is proved any more, so it now counts as refused. */
export function markRefused(host: string, connection: object): boolean {
  const state = stateFor(host);
  if (!state) return false;
  state.proved.delete(connection);
  if (state.proved.size > 0) return false;
  state.refused = true;
  const err = notProved(keyOfHost(host));
  for (const w of state.waiters) w.reject(err);
  state.waiters.clear();
  return true;
}

/** True when a request to `url` has to wait: its server is watched and nothing to it has proved itself. */
export function mustWait(url: string): boolean {
  const key = keyOfUrl(url);
  const state = key ? hosts.get(key) : undefined;
  return !!state && state.proved.size === 0;
}

/** Resolves once `url`'s server has proved itself. Rejects on a refusal or after `PROOF_WAIT_MS`. */
export function waitForProof(url: string, signal?: AbortSignal | null): Promise<void> {
  const key = keyOfUrl(url);
  const state = key ? hosts.get(key) : undefined;
  if (!state || state.proved.size > 0) return Promise.resolve();
  if (state.refused) return Promise.reject(notProved(key));

  return new Promise<void>((resolve, reject) => {
    const waiter = {
      resolve: () => {
        done();
        resolve();
      },
      reject: (err: Error) => {
        done();
        reject(err);
      },
    };
    const timer = setTimeout(() => waiter.reject(new Error(`${key} did not prove its identity in time.`)), PROOF_WAIT_MS);
    const onAbort = () => {
      const reason: unknown = signal?.reason;
      const err = reason instanceof Error ? reason : new Error("Aborted");
      if (!(reason instanceof Error)) err.name = "AbortError";
      waiter.reject(err);
    };
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      state.waiters.delete(waiter);
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort);
    state.waiters.add(waiter);
  });
}

const bearer = (value: string | null | undefined): boolean => !!value && /^bearer\s/i.test(value.trim());

/** The Authorization header, however the caller passed its headers. */
function authorizationOf(init: RequestInit | undefined, request: Request | null): string | null {
  const headers = init?.headers ?? request?.headers;
  if (!headers) return null;
  if (typeof Headers !== "undefined" && headers instanceof Headers) return headers.get("authorization");
  const entries = Array.isArray(headers) ? headers : Object.entries(headers as Record<string, string>);
  for (const [name, value] of entries) {
    if (String(name).toLowerCase() === "authorization") return String(value);
  }
  return null;
}

let installed = false;

/** Wraps the global `fetch` once. Only a bearer request to a watched host waits; the phone
 *  sends nothing with a token over bare `XMLHttpRequest`, so that is left alone. */
export function installProofGate(): void {
  if (installed) return;
  const originalFetch = globalThis.fetch?.bind(globalThis);
  if (!originalFetch) return;
  installed = true;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = typeof Request !== "undefined" && input instanceof Request ? input : null;
    const url = request ? request.url : String(input);
    if (bearer(authorizationOf(init, request)) && mustWait(url)) {
      await waitForProof(url, init?.signal ?? request?.signal);
    }
    return originalFetch(input, init);
  }) as typeof fetch;
}
