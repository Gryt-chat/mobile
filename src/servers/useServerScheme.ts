import { useEffect, useState } from "react";

import { getRememberedScheme, schemeConfirmed, type Scheme } from "./address";
import { resolveScheme } from "./info";
import { useServers } from "./store";

export interface ServerScheme {
  /** Null while it is still being worked out. Nothing should dial yet. */
  scheme: Scheme | null;
  /** True when a server answered on it this run. See `ResolvedScheme`. */
  confirmed: boolean;
}

/**
 * How to dial a host, before anything opens a socket. **A hook rather than a line inside
 * the connection, because it has to be able to wait**. What it learns is written back,
 * so it is asked once per server (GRYT-499).
 */
export function useServerScheme(host: string | null): ServerScheme {
  const { recordScheme } = useServers();
  const [state, setState] = useState<ServerScheme>({ scheme: null, confirmed: false });

  useEffect(() => {
    if (!host) {
      setState({ scheme: null, confirmed: false });
      return;
    }

    /* Synchronously, so a server whose scheme is known does not spend a render with
     * nothing to dial — the storage read finished before any host could be active. */
    const known = getRememberedScheme(host);
    if (known) {
      /* Confirmation is asked for separately, because a scheme restored from
       * storage is dialled without anything having answered on it. GRYT-522. */
      setState({ scheme: known, confirmed: schemeConfirmed(host) });
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
