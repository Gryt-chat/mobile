import { useEffect, useState } from "react";

import { useGrytAccount } from "../account/AccountProvider";
import { CLOUD_CONSOLE_URL, cloudEnabled } from "../server/planMode";

export type CloudUsage = {
  plan: { id: string; name: string };
  cycle: "monthly" | "yearly";
  storage: { used: number | null; limit: number };
  transfer: { sent: number | null; month: string };
  manage: string;
};

/** Kept per host, so the usage screen opens with what the settings list already fetched. */
const seen = new Map<string, CloudUsage>();

/** Plan, storage and this month's transfer for a Cloud server the signed-in account owns; null otherwise. */
export function useCloudUsage(host: string | undefined) {
  const { state, getAccessToken } = useGrytAccount();
  const signedIn = state.status === "signedIn";
  const [usage, setUsage] = useState<CloudUsage | null>(host ? seen.get(host) ?? null : null);
  useEffect(() => {
    if (!cloudEnabled || !signedIn || !host) return;
    let live = true;
    void (async () => {
      const token = await getAccessToken().catch(() => null);
      if (!token) return;
      const r = await fetch(`${CLOUD_CONSOLE_URL}/api/app/servers/${encodeURIComponent(host)}/usage`, { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
      const u = r?.ok ? ((await r.json().catch(() => null)) as CloudUsage | null) : null;
      if (!live) return;
      if (u?.plan && u.storage) seen.set(host, u);
      else seen.delete(host);
      setUsage(u?.plan && u.storage ? u : null);
    })();
    return () => {
      live = false;
    };
  }, [host, signedIn, getAccessToken]);
  return usage;
}
