import { useEffect, useRef } from "react";

import { useGrytAccount } from "../account/AccountProvider";
import { CLOUD_CONSOLE_URL, cloudEnabled } from "../server/planMode";
import { fetchServerInfo } from "./info";
import { useServers } from "./store";

/** On sign-in, join any Gryt Cloud server the account owns that this phone doesn't have yet. Once per launch. */
export function CloudServerSync() {
  const { state, getAccessToken } = useGrytAccount();
  const { servers, join } = useServers();
  const done = useRef(false);
  const signedIn = state.status === "signedIn";

  useEffect(() => {
    if (!cloudEnabled || !signedIn || done.current) return;
    done.current = true;
    void (async () => {
      const token = await getAccessToken().catch(() => null);
      if (!token) return;
      const r = await fetch(`${CLOUD_CONSOLE_URL}/api/app/servers`, { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
      const hosts = ((await r?.json().catch(() => null)) as { servers?: string[] } | null)?.servers;
      if (!Array.isArray(hosts)) return;
      const have = new Set(servers.map((s) => s.host));
      for (const host of hosts) {
        if (typeof host !== "string" || have.has(host)) continue;
        const info = await fetchServerInfo(host);
        if (info.kind === "info") await join(host, info.info).catch(() => {});
      }
    })();
  }, [signedIn, servers, join, getAccessToken]);

  return null;
}
