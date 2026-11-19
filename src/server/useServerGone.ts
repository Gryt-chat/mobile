import { useEffect, useState } from "react";

import { getServerHttpBase } from "../servers/address";

/** A deleted Gryt Cloud server's address answers 410 with the day it went, for 30 days. Asked only while `ask` holds. */
export function useServerGone(host: string | null | undefined, ask: boolean): string | null {
  const [deletedOn, setDeletedOn] = useState<string | null>(null);
  useEffect(() => {
    if (!host || !ask) return;
    const abort = new AbortController();
    fetch(`${getServerHttpBase(host)}/info`, { signal: abort.signal })
      .then(async (r) => {
        if (r.status !== 410) return;
        const body = (await r.json().catch(() => null)) as { error?: string; deleted_on?: string } | null;
        if (body?.error === "deleted" && typeof body.deleted_on === "string") setDeletedOn(body.deleted_on);
      })
      .catch(() => {});
    return () => abort.abort();
  }, [host, ask]);
  return deletedOn;
}
