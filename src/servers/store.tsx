import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  getRememberedScheme,
  normalizeHost,
  restoreScheme,
  type Scheme,
} from "./address";
import type { ServerInfo } from "./info";
import { forgetAccountServer } from "../account/accountServers";
import { forgetInviteCode } from "./inviteCodes";

/**
 * The servers you have joined. The shape is the desktop's `Server` — **`host`
 * is the identity**, and two entries for one address is a bug.
 *
 * `name` is cached rather than authoritative: the live one comes from the
 * socket, and this is what to draw before it connects.
 */
export interface JoinedServer {
  host: string;
  name: string;
  description?: string;
  serverId?: string;
  /**
   * What this server answered `/info` on. Here rather than only in the module
   * map, which is empty at every launch — so an https server joined yesterday
   * was dialled `ws://` today and the socket died silently (GRYT-499).
   *
   * **Missing means "ask", not "http"** — see `resolveScheme`.
   */
  scheme?: Scheme;
  /**
   * What this server last called you, so a launch that has not connected shows
   * that rather than falling back to the account's name. The server owns it;
   * this is a copy to draw before the session exists (GRYT-500).
   */
  nickname?: string;
}

const STORAGE_KEY = "servers";

interface ServersValue {
  servers: JoinedServer[];
  /** False until the first read finishes, so nothing flashes an empty state. */
  ready: boolean;
  /**
   * Only the three fields that get stored, not a whole `ServerInfo`. A server
   * with `discoverable` off publishes none of it and can still be joined, so
   * asking for the full shape means inventing a member count (GRYT-845).
   */
  join: (host: string, info: Pick<ServerInfo, "name" | "description" | "serverId">) => Promise<void>;
  leave: (host: string) => Promise<void>;
  has: (host: string) => boolean;
  /** Remember what a server answered on, so the next launch dials it right. */
  recordScheme: (host: string, scheme: Scheme) => Promise<void>;
  /** Remember what a server calls you, for the launches before it answers. */
  recordNickname: (host: string, nickname: string) => Promise<void>;
}

const ServersContext = createContext<ServersValue | null>(null);

export function useServers() {
  const value = useContext(ServersContext);
  if (!value) throw new Error("useServers must be used inside ServersProvider.");
  return value;
}

export function ServersProvider({ children }: { children?: ReactNode }) {
  const [servers, setServers] = useState<JoinedServer[]>([]);
  const [ready, setReady] = useState(false);

  /**
   * The list as it is *now*, for the writers called from effects.
   * **`recordScheme` and `recordNickname` have to be stable** — the connection
   * resolves a scheme in an effect keyed on them, and one that changed identity
   * with the server list would abort that lookup half way through.
   */
  const latest = useRef<JoinedServer[]>([]);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const stored = parsed as JoinedServer[];
            /* Before anything is drawn, and before anything can dial. The
             * address module answers `schemeFor` out of this map, and every
             * caller of it — the socket, the avatar upload — would otherwise
             * get the plain default for a server that is known to be https. */
            for (const server of stored) {
              /* `restoreScheme` rather than `rememberScheme`: this says what to
               * dial and stops short of claiming the server is up, which is a
               * question only a reply this run can answer. GRYT-522. */
              if (server.scheme) restoreScheme(server.host, server.scheme);
            }
            latest.current = stored;
            setServers(stored);
          }
        }
      })
      .catch(() => {
        // Unreadable storage is an empty list, not a crash. The add-server
        // screen is a recoverable place to land; a broken app is not.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: JoinedServer[]) => {
    latest.current = next;
    setServers(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Kept in memory for this run. Losing it on restart is better than
      // refusing the join that has already succeeded.
    }
  }, []);

  /** Change the list from whatever it is now, or do nothing if nothing moves. */
  const update = useCallback(
    (change: (previous: JoinedServer[]) => JoinedServer[]) => {
      const next = change(latest.current);
      if (next === latest.current) return Promise.resolve();
      return persist(next);
    },
    [persist],
  );

  const join = useCallback(
    (host: string, info: Pick<ServerInfo, "name" | "description" | "serverId">) => {
      const normalized = normalizeHost(host);
      return update((previous) => {
        const already = previous.find((s) => s.host === normalized);
        const entry: JoinedServer = {
          host: normalized,
          name: info.name,
          description: info.description,
          serverId: info.serverId,
          /* Whatever answered the `/info` that produced this `info` — the
           * lookup runs immediately before the join, and it records what
           * actually replied rather than what was asked for. */
          scheme: getRememberedScheme(normalized) ?? already?.scheme,
          nickname: already?.nickname,
        };
        // Replaced rather than appended, so joining a server you are already in
        // refreshes what it said about itself instead of listing it twice.
        return [...previous.filter((s) => s.host !== normalized), entry];
      });
    },
    [update],
  );

  const leave = useCallback(
    (host: string) => {
      const normalized = normalizeHost(host);
      /* Whether this was an account membership stops being true the moment it
       * stops being a membership. Left behind, the entry would silently take a
       * *guest* join made at the same address later down with the next sign-out.
       * GRYT-572. */
      void forgetAccountServer(normalized);
      /* And the invite that got this device in. Leaving it behind would hand a
       * later join at the same address a code for a membership that is gone —
       * quietly spending a use of an invite nobody meant to use. GRYT-845. */
      void forgetInviteCode(normalized);
      return update((previous) => previous.filter((s) => s.host !== normalized));
    },
    [update],
  );

  const recordScheme = useCallback(
    (host: string, scheme: Scheme) => {
      const normalized = normalizeHost(host);
      return update((previous) => {
        const current = previous.find((s) => s.host === normalized);
        if (!current || current.scheme === scheme) return previous;
        return previous.map((s) => (s.host === normalized ? { ...s, scheme } : s));
      });
    },
    [update],
  );

  const recordNickname = useCallback(
    (host: string, nickname: string) => {
      const normalized = normalizeHost(host);
      return update((previous) => {
        const current = previous.find((s) => s.host === normalized);
        if (!current || current.nickname === nickname) return previous;
        return previous.map((s) => (s.host === normalized ? { ...s, nickname } : s));
      });
    },
    [update],
  );

  const value = useMemo<ServersValue>(
    () => ({
      servers,
      ready,
      has: (host) => servers.some((s) => s.host === normalizeHost(host)),
      join,
      leave,
      recordScheme,
      recordNickname,
    }),
    [servers, ready, join, leave, recordScheme, recordNickname],
  );

  return <ServersContext.Provider value={value}>{children}</ServersContext.Provider>;
}
