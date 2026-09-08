import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  NO_OVERRIDE,
  parseOverride,
  resolveAccountConfig,
  toOverride,
  discoveryFor,
  type AccountConfig,
  type AuthOverride,
} from "./authServer";

/**
 * Where a Gryt account lives, and how to point the phone somewhere else. **Both halves
 * can be overridden.** The decisions live in `authServer.ts` (GRYT-505).
 */

const STORAGE_KEY = "auth-server";

/**
 * Held in a module rather than in React: every reader is inside an async function
 * partway through signing in. **A stale copy in a closure is the failure this stops.**
 */
let override: AuthOverride = NO_OVERRIDE;

/** What is set now. The default until `loadAuthOverride` has run. */
export function authOverride(): AuthOverride {
  return override;
}

/**
 * Read the override out of storage, before anything asks for the config. A token
 * restored against one issuer and refreshed against another fails opaquely.
 */
export async function loadAuthOverride(): Promise<AuthOverride> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) override = parseOverride(JSON.parse(raw));
  } catch {
    // An unreadable override is no override, which is the production default
    // and a working app. Refusing to start over a settings blob would not be.
  }
  return override;
}

/** Both at once. See the note on `AuthOverride` for why never one. */
export async function setAuthOverride(next: Partial<AuthOverride>): Promise<AuthOverride> {
  override = toOverride(next);

  try {
    if (override.issuer || override.identityUrl) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(override));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Applies for this run and not the next. Better than refusing a change the
    // screen has already reported as saved.
  }

  return override;
}

export function accountConfig(): AccountConfig {
  return resolveAccountConfig(override);
}

export function discovery() {
  return discoveryFor(accountConfig().issuer);
}

export { discoveryFor };
export type { AccountConfig, AuthOverride };
