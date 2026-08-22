import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { useEffect, useState } from "react";

/**
 * A random id for this install of the app.
 *
 * **Per install, not per person, and deliberately not derived from anything.**
 * The service counts rate limits against it and uses it to tie one person's
 * reports together, which is worth having — a second report saying "still
 * happening" is only useful if you can see it is the same reporter. Deriving it
 * from the identity key would do the same job and would also link every report
 * to the identity that joins servers, which is a thing the guest design spends
 * a lot of effort keeping separate.
 *
 * Reinstalling gives a new one. That is correct: it is an install id.
 */

const KEY = "reportInstallId";

async function load(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(KEY);
    if (existing) return existing;
  } catch {
    // Unreadable storage means a new id this run, which costs a rate-limit
    // bucket and nothing else.
  }

  const fresh = Crypto.randomUUID();
  try {
    await AsyncStorage.setItem(KEY, fresh);
  } catch {
    // Same again: it works for this run.
  }
  return fresh;
}

/** Null until storage has answered. A report sent before then simply omits it. */
export function useInstallId(): string | null {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void load().then((value) => {
      if (!cancelled) setId(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return id;
}
