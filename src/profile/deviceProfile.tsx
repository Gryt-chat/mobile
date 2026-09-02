import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";

import { pickRandomName } from "./randomName";
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

/**
 * Your name and picture, belonging to you rather than to a server.
 *
 * The reported bug was that neither can be changed unless you are in a server,
 * and that was true and deliberate as built: the nickname is a column on a
 * *server's* `users` row and the avatar is a file in *that server's* bucket, so
 * with no server there was nowhere to put either. Not a guard to delete — a
 * missing concept. GRYT-498.
 *
 * This is the device-level half of it. It is a default rather than an identity:
 * `joinServer` already carries a nickname and took it from `useMe().name`,
 * which is why every guest arrived called "You". The account-level version,
 * where signing in carries your profile between phones, needs somewhere to put
 * an avatar for an account and belongs with the identity service.
 *
 * **Changing this does not rename you on servers you have already joined.**
 * The per-server nickname is an override and stays one — being called something
 * different in one room is a real thing people want, and quietly overwriting a
 * name somebody set on purpose would be worse than not having this at all. It
 * is the default for the servers you join next.
 */

const STORAGE_KEY = "profile";

interface StoredProfile {
  nickname?: string;
  avatarUri?: string;
}

export interface DeviceProfile {
  /**
   * Null only before storage has answered, and after a read that failed.
   *
   * A phone with nothing stored is given a random name on first launch rather
   * than left blank, so the "You" the callers fall back to is now the
   * unreadable-storage case rather than the ordinary one. GRYT-846.
   */
  nickname: string | null;
  /** A `file://` uri in the app's documents, or null. */
  avatarUri: string | null;
  /** False until storage has answered, so nothing offers to edit a blank. */
  ready: boolean;
  setNickname: (nickname: string) => Promise<void>;
  setAvatar: (uri: string) => Promise<void>;
}

const DeviceProfileContext = createContext<DeviceProfile | null>(null);

export function useDeviceProfile(): DeviceProfile {
  const value = useContext(DeviceProfileContext);
  if (!value) {
    throw new Error("useDeviceProfile must be used inside DeviceProfileProvider.");
  }
  return value;
}

/**
 * Where a chosen picture is kept.
 *
 * The documents directory, not the cache. `ImagePicker` hands back a uri in the
 * cache directory, which iOS is free to empty whenever it wants storage back —
 * so keeping that uri means a profile picture that vanishes at some point with
 * nothing having happened. The copy is what makes it a file the app owns.
 */
const PICTURES = new Directory(Paths.document, "profile");

async function keep(uri: string, stamp: number): Promise<string> {
  PICTURES.create({ idempotent: true });

  const source = new File(uri);
  /* A new name every time rather than one fixed one. `Image` caches by uri, so
   * overwriting in place shows the previous picture until the app restarts. */
  const extension = source.extension.replace(/^\./, "") || "jpg";
  const target = new File(PICTURES, `avatar-${stamp}.${extension}`);

  await source.copy(target);
  return target.uri;
}

/** The one before it, so a picture changed ten times leaves one file behind. */
function discard(uri: string | null) {
  if (!uri) return;
  try {
    const previous = new File(uri);
    if (previous.exists) previous.delete();
  } catch {
    // A file that cannot be deleted is wasted space, not a failure worth
    // showing anybody. The new picture is already saved by this point.
  }
}

export function DeviceProfileProvider({ children }: { children?: ReactNode }) {
  const [profile, setProfile] = useState<StoredProfile>({});
  const [ready, setReady] = useState(false);

  /* The stored value as it is now, for the writers. Same reason as the server
   * list: these are called from event handlers and must not go stale. */
  const latest = useRef<StoredProfile>({});

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;

        const parsed: unknown = raw ? JSON.parse(raw) : null;
        const stored: StoredProfile =
          parsed && typeof parsed === "object" ? (parsed as StoredProfile) : {};

        /**
         * A phone that has never been named gets one now, and keeps it.
         *
         * Written back rather than generated per read, because the avatar is
         * seeded on the name: picking again on every launch would change your
         * face every launch. Storing it also makes this the same editable
         * default as a name somebody typed — the You page offers to change it,
         * and nothing downstream needs to know it was not chosen. GRYT-846.
         */
        const next: StoredProfile = stored.nickname
          ? stored
          : { ...stored, nickname: pickRandomName() };

        latest.current = next;
        setProfile(next);

        if (next !== stored) {
          /* Not awaited. The name is already on screen and already the one a
           * join will carry; a storage failure costs a different name next
           * launch, which is not worth blocking the first render on. */
          void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        }
      })
      .catch(() => {
        // An unreadable profile is no profile. The app still runs and the name
        // falls back to "You", which is what it did before this existed.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: StoredProfile) => {
    latest.current = next;
    setProfile(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Kept for this run. Losing it on restart is better than refusing a
      // change that is already on screen.
    }
  }, []);

  const setNickname = useCallback(
    (nickname: string) => {
      const trimmed = nickname.trim();
      if (!trimmed) return Promise.resolve();
      return persist({ ...latest.current, nickname: trimmed });
    },
    [persist],
  );

  const setAvatar = useCallback(
    async (uri: string) => {
      const previous = latest.current.avatarUri ?? null;
      const kept = await keep(uri, Date.now());
      await persist({ ...latest.current, avatarUri: kept });
      discard(previous);
    },
    [persist],
  );

  const value = useMemo<DeviceProfile>(
    () => ({
      nickname: profile.nickname ?? null,
      avatarUri: profile.avatarUri ?? null,
      ready,
      setNickname,
      setAvatar,
    }),
    [profile, ready, setNickname, setAvatar],
  );

  return (
    <DeviceProfileContext.Provider value={value}>{children}</DeviceProfileContext.Provider>
  );
}
