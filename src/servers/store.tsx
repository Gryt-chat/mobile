import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { normalizeHost } from "./address";
import type { ServerInfo } from "./info";

/**
 * The servers you have joined.
 *
 * The shape is the desktop client's `Server` — `host` is the identity, and the
 * rest is what the server said about itself when you joined. The client keys
 * its map by host for the same reason: a server is an address, and two entries
 * for one address is a bug rather than a feature.
 *
 * `name` is cached rather than authoritative. The live name comes from the
 * socket once there is one; this is what to draw before it connects, so a cold
 * start shows the list rather than a screen of placeholders.
 */
export interface JoinedServer {
  host: string;
  name: string;
  description?: string;
  serverId?: string;
}

const STORAGE_KEY = "servers";

interface ServersValue {
  servers: JoinedServer[];
  /** False until the first read finishes, so nothing flashes an empty state. */
  ready: boolean;
  join: (host: string, info: ServerInfo) => Promise<void>;
  leave: (host: string) => Promise<void>;
  has: (host: string) => boolean;
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

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) setServers(parsed as JoinedServer[]);
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
    setServers(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Kept in memory for this run. Losing it on restart is better than
      // refusing the join that has already succeeded.
    }
  }, []);

  const value = useMemo<ServersValue>(
    () => ({
      servers,
      ready,
      has: (host) => servers.some((s) => s.host === normalizeHost(host)),
      join: async (host, info) => {
        const normalized = normalizeHost(host);
        const entry: JoinedServer = {
          host: normalized,
          name: info.name,
          description: info.description,
          serverId: info.serverId,
        };
        // Replaced rather than appended, so joining a server you are already in
        // refreshes what it said about itself instead of listing it twice.
        await persist([...servers.filter((s) => s.host !== normalized), entry]);
      },
      leave: async (host) => {
        const normalized = normalizeHost(host);
        await persist(servers.filter((s) => s.host !== normalized));
      },
    }),
    [servers, ready, persist],
  );

  return <ServersContext.Provider value={value}>{children}</ServersContext.Provider>;
}
