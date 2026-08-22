import { useEffect, useState } from "react";

import { getRememberedScheme, type Scheme } from "./address";
import { resolveScheme } from "./info";
import { useServers } from "./store";

export interface ServerScheme {
  /** Null while it is still being worked out. Nothing should dial yet. */
  scheme: Scheme | null;
  /** True when a server actually answered on it. See `ResolvedScheme`. */
  confirmed: boolean;
}

/**
 * How to dial a host, before anything opens a socket to it.
 *
 * This is the fix for the failure in GRYT-499 and it is a hook rather than a
 * line inside the connection because it has to be able to *wait*. A server
 * joined on an earlier run has its scheme in storage and is answered instantly;
 * one stored before that field existed has to be asked, and asking is a round
 * trip that the connection effect cannot do without becoming async.
 *
 * A scheme learned this way is written back to the joined server, so it is
 * asked once per server rather than once per launch.
 */
export function useServerScheme(host: string | null): ServerScheme {
  const { recordScheme } = useServers();
  const [state, setState] = useState<ServerScheme>({ scheme: null, confirmed: false });

  useEffect(() => {
    if (!host) {
      setState({ scheme: null, confirmed: false });
      return;
    }

    /* Synchronously, so a server whose scheme is already known does not spend a
     * render with nothing to dial — the storage read that seeds this map
     * finished before any host could be active. */
    const known = getRememberedScheme(host);
    if (known) {
      setState({ scheme: known, confirmed: true });
      return;
    }

    setState({ scheme: null, confirmed: false });

    const controller = new AbortController();
    void resolveScheme(host, controller.signal).then((resolved) => {
      if (controller.signal.aborted) return;
      setState(resolved);
      /* Only a scheme a server answered on. Storing the fallback would turn a
       * server that happened to be down into one permanently pinned to plain. */
      if (resolved.confirmed) void recordScheme(host, resolved.scheme);
    });

    return () => controller.abort();
  }, [host, recordScheme]);

  return state;
}
