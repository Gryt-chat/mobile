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
   * Set when iOS is holding the browser rather than running it, which means local
   * network access was refused. There is no API to ask again.
   */
  blocked: boolean;
}

/**
 * Gryt servers on this network, while `active`. On iOS the first browse triggers the
 * local-network prompt. The joined list is passed in: context dies inside a `Sheet`.
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
    /* Still searching while the browser is starting up: the gap between `start()` and
     * `.ready` is where an empty network shows "none found" and then a list. */
    searching:
      active &&
      servers.length === 0 &&
      (state === "stopped" || state === "browsing"),
    blocked: state === "waiting",
  };
}
