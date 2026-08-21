import { useEffect, useMemo, useState } from "react";

import {
  browseLanServers,
  lanDiscoveryAvailable,
  type LanDiscoveryState,
  type LanServer,
} from "../../modules/lan-discovery";
import { describeLanServers, type DiscoveredServer } from "./lanServers";
import type { JoinedServer } from "./store";

export interface LanServersState {
  servers: DiscoveredServer[];
  /** False on Android, and in a build that has not picked the module up. */
  available: boolean;
  /** True while the browser is up and nothing has answered yet. */
  searching: boolean;
  /**
   * Set when iOS is holding the browser rather than running it, which in
   * practice means local network access was refused. There is no API to ask
   * again — the answer lives in Settings — so this is worded as somewhere to
   * go rather than as something to retry.
   */
  blocked: boolean;
}

/**
 * Gryt servers on this network, while `active`.
 *
 * `active` rather than always-on for two reasons, and the second is the one
 * that matters. A browser holds a socket and wakes for every announcement on
 * the network, which is not something to do for the life of the app. And on
 * iOS the *first* browse is what triggers the local-network permission prompt
 * — so starting one at launch asks a question about a feature nobody has
 * looked for yet. Opening the join sheet is where the question makes sense.
 *
 * The joined list is passed in rather than read from `useServers` here,
 * because the one caller is inside a `Sheet` and context does not survive the
 * portal. That is written up in the app README and this is the fourth
 * component to meet it.
 */
export function useLanServers(
  active: boolean,
  joined: JoinedServer[],
): LanServersState {
  const [found, setFound] = useState<LanServer[]>([]);
  const [state, setState] = useState<LanDiscoveryState>("stopped");

  useEffect(() => {
    if (!active) {
      setFound([]);
      setState("stopped");
      return;
    }

    return browseLanServers({
      onServers: setFound,
      onState: (next) => setState(next),
    });
  }, [active]);

  const servers = useMemo(
    () => describeLanServers(found, joined),
    [found, joined],
  );

  return {
    servers,
    available: lanDiscoveryAvailable,
    /* Still searching while the browser is starting up, not only once it is
     * ready: the gap between `start()` and `.ready` is where a network with
     * nothing on it otherwise shows "none found" and then a list. */
    searching:
      active &&
      servers.length === 0 &&
      (state === "stopped" || state === "browsing"),
    blocked: state === "waiting",
  };
}
