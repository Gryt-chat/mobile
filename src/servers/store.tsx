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
 * The servers you have joined, in the desktop's `Server` shape — **`host` is the
 * identity**. `name` is cached rather than authoritative.
 */
export interface JoinedServer {
  host: string;
  name: string;
  description?: string;
  serverId?: string;
  /**
   * What this server answered `/info` on. Here rather than only in the module map,
   * which is empty at every launch. **Missing means "ask", not "http"** (GRYT-499).
   */
  scheme?: Scheme;
  /**
   * What this server last called you, so a launch that has not connected shows that
   * rather than the account's name. The server owns it (GRYT-500).
   */
  nickname?: string;
}

const STORAGE_KEY = "servers";

interface ServersValue {
  servers: JoinedServer[];
  /** False until the first read finishes, so nothing flashes an empty state. */
  ready: boolean;
  /**
   * Only the three fields that get stored, not a whole `ServerInfo`: a server with
   * `discoverable` off publishes none of it and can still be joined (GRYT-845).
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
   * The list as it is *now*, for the writers called from effects. **`recordScheme`
   * and `recordNickname` have to be stable**, or they abort the lookup half way.
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
            /* Before anything is drawn, and before anything can dial: the address
             * module answers `schemeFor` out of this map. */
            for (const server of stored) {
              /* `restoreScheme` rather than `rememberScheme`: this says what to dial
               * and stops short of claiming the server is up (GRYT-522). */
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
          /* Whatever answered the `/info` that produced this `info` — it records what
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
      /* Whether this was an account membership stops being true the moment it stops
       * being a membership, or a later guest join goes down with a sign-out. */
      void forgetAccountServer(normalized);
      /* And the invite that got this device in, or a later join at the same address
       * quietly spends a use of it (GRYT-845). */
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
