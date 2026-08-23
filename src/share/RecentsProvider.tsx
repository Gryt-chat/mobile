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

import { useServers } from "../servers/store";
import { parseRecents, remember, type RecentChannel } from "./recents";

/**
 * Where you last spoke, kept across launches.
 *
 * Sharing a picture into Gryt has to ask "where?", and this is what makes the
 * answer a list rather than a walk through every server and every channel. The
 * rules — dedup, order, cap — are in `recents.ts` and tested there; this is the
 * part that touches storage and the server list.
 *
 * **AsyncStorage rather than SecureStore.** Nothing here is a secret: it is a
 * handful of channel ids and the names they had. The seed is the one thing on
 * this phone worth protecting, and putting a convenience list beside it would
 * only make that boundary less obvious.
 */

interface RecentsValue {
  recents: RecentChannel[];
  /** False until the first read finishes, so the picker does not flash empty. */
  ready: boolean;
  /** Called on send. See `recents.ts` for why it is send and not open. */
  record: (entry: Omit<RecentChannel, "at">) => void;
}

const STORAGE_KEY = "share.recents";

const RecentsContext = createContext<RecentsValue | null>(null);

export function useRecents() {
  const value = useContext(RecentsContext);
  if (!value) throw new Error("useRecents must be used inside RecentsProvider.");
  return value;
}

export function RecentsProvider({ children }: { children?: ReactNode }) {
  const [recents, setRecents] = useState<RecentChannel[]>([]);
  const [ready, setReady] = useState(false);
  const { servers, ready: serversReady } = useServers();

  /* The list as it is now, for `record` — which is called from a send handler
   * and must not depend on a render having happened first. */
  const live = useRef<RecentChannel[]>([]);
  live.current = recents;

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        setRecents(parseRecents(raw ? JSON.parse(raw) : null));
      } catch {
        /* A list that will not parse is a list to start again, not a launch to
         * fail. `parseRecents` already drops bad rows; this is for the file
         * being unreadable altogether. */
        setRecents([]);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const write = useCallback((next: RecentChannel[]) => {
    live.current = next;
    setRecents(next);
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {
      /* The list is a convenience and the in-memory copy is already updated, so
       * a failed write costs the next launch's ordering and nothing else. */
    });
  }, []);

  const record = useCallback(
    (entry: Omit<RecentChannel, "at">) => {
      write(remember(live.current, { ...entry, at: Date.now() }));
    },
    [write],
  );

  /**
   * Drop channels on servers that are no longer joined.
   *
   * Watching the list rather than hooking `leave`, because leaving is not the
   * only way a server goes: signing out of an account takes its servers with it
   * (GRYT-572), and a second reason to prune is a second place to forget to.
   *
   * Waits for `serversReady`. The list is empty for the first frame of every
   * launch, and pruning against that would delete every recent on the phone
   * before the servers had finished loading.
   */
  useEffect(() => {
    if (!ready || !serversReady) return;
    const joined = new Set(servers.map((server) => server.host));
    const kept = live.current.filter((item) => joined.has(item.host));
    if (kept.length !== live.current.length) write(kept);
  }, [ready, serversReady, servers, write]);

  const value = useMemo<RecentsValue>(
    () => ({ recents, ready, record }),
    [recents, ready, record],
  );

  return <RecentsContext.Provider value={value}>{children}</RecentsContext.Provider>;
}
