import { useEffect, useState } from "react";

import { fetchServerInfo, type ServerInfo } from "./info";

/**
 * The one Gryt server we run ourselves.
 *
 * Hardcoded rather than configured, and the same value the desktop client
 * carries. It is already hardcoded in the Terms, the Privacy page and the
 * Community Guidelines, and a value that has to agree with three published
 * legal pages is not one anybody should be able to point somewhere else.
 */
export const OFFICIAL_SERVER_HOST = "community.gryt.chat";

export interface OfficialServer {
  host: string;
  /**
   * What it says about itself, or null when it answered but keeps its public
   * info switched off. Either way it is up, which is the question here.
   */
  info: ServerInfo | null;
}

/**
 * Remembered for as long as the app is running, because the answer does not
 * change while it is and the sheet is opened more than once.
 *
 * Only a server that answered is cached. Caching "unreachable" would mean
 * somebody who opened the sheet with no signal never sees the row again until
 * they restart, and no signal is what a phone has fairly often.
 */
let cached: OfficialServer | null = null;

/**
 * Whether there is an official server to offer, and what it calls itself.
 *
 * A probe rather than a constant because the row it feeds is an offer: a server
 * that does not answer must not be suggested, or the first thing a new install
 * does is hand somebody an address that fails. `/info` is the same endpoint the
 * preview uses, so an answer here means the lookup that follows gets one too.
 */
export function useOfficialServer(enabled: boolean): OfficialServer | null {
  const [server, setServer] = useState<OfficialServer | null>(cached);

  useEffect(() => {
    if (!enabled || server) return;

    const controller = new AbortController();

    void fetchServerInfo(OFFICIAL_SERVER_HOST, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.kind !== "info" && result.kind !== "private") return;

      cached = {
        host: OFFICIAL_SERVER_HOST,
        info: result.kind === "info" ? result.info : null,
      };
      setServer(cached);
    });

    return () => controller.abort();
  }, [enabled, server]);

  return server;
}
