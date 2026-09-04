import {
  requireOptionalNativeModule,
  type EventSubscription,
} from "expo-modules-core";

/**
 * Gryt servers on the network you are on.
 *
 * The server advertises itself over mDNS as `_gryt._tcp` — that is
 * `packages/server/src/mdns.ts`. React Native has no browser for the service,
 * so this is a local Expo module over `NWBrowser`; see
 * `LanDiscoveryModule.swift` for what it does and does not promise.
 *
 * **Optional on purpose**, the same way `modules/audio-route` is.
 * `requireOptionalNativeModule` returns null on Android and in any JS-only
 * context, and everything below reads null as "there is nothing to find here"
 * rather than throwing. Discovery should never be the reason the join sheet
 * will not open.
 */

export interface LanServer {
  /** The mDNS instance name, which is what the server calls itself. */
  name: string;
  /** An IPv4 address. Browsing finds a name; the module resolves it. */
  host: string;
  port: number;
  /**
   * The `server_id` from the TXT record, when the server published one.
   *
   * Null rather than absent for an older server. It is what deduplicates a
   * server answering on two interfaces, so a missing one means "cannot tell",
   * not "different server".
   */
  serverId: string | null;
}

/**
 * What the browser is doing.
 *
 * `waiting` is the one worth handling: on iOS it is where a refused local
 * network permission arrives, and the browser stays alive in it rather than
 * failing, so a UI that only knows "searching" spins forever.
 */
export type LanDiscoveryState =
  | "browsing"
  | "waiting"
  | "failed"
  | "stopped";

interface LanDiscoveryModule {
  start(): void;
  stop(): void;
  addListener(
    event: "onServersChanged",
    listener: (payload: { servers: LanServer[] }) => void,
  ): EventSubscription;
  addListener(
    event: "onStateChange",
    listener: (payload: { state: LanDiscoveryState; message?: string }) => void,
  ): EventSubscription;
}

const native = requireOptionalNativeModule<LanDiscoveryModule>("LanDiscovery");

/** Whether this build can look at all. */
export const lanDiscoveryAvailable = native !== null;

export interface LanDiscoveryListeners {
  onServers: (servers: LanServer[]) => void;
  onState: (state: LanDiscoveryState, message?: string) => void;
}

/**
 * Start looking, and keep looking until the returned function is called.
 *
 * The listeners go on before the browser starts, because the first result can
 * arrive on the same turn as the start on a network that has already been
 * browsed once.
 *
 * Returns a no-op where there is no module, so an effect can return it
 * unconditionally.
 */
export function browseLanServers(listeners: LanDiscoveryListeners): () => void {
  if (!native) return () => {};

  const servers = native.addListener("onServersChanged", ({ servers }) =>
    listeners.onServers(servers),
  );
  const state = native.addListener("onStateChange", ({ state, message }) =>
    listeners.onState(state, message),
  );

  native.start();

  return () => {
    native.stop();
    servers.remove();
    state.remove();
  };
}
