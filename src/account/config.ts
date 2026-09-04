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
 * Where a Gryt account lives, and how to point the phone somewhere else.
 *
 * By default the same realm and client the desktop client uses. `gryt-web` is a
 * public client with PKCE and its redirect list already contains
 * `gryt://auth/callback` — checked against the deployed realm rather than the
 * JSON in `packages/auth`, because those two are allowed to drift and only one
 * of them can refuse a login.
 *
 * **Both halves can be overridden**, which is what the advanced screen in
 * Preferences does. Gryt is meant to be self-hosted and the desktop has had
 * this for a while; the phone claiming to be the same client while pinning one
 * company's Keycloak was the odd one out. It also means the local auth stack
 * `ops/start_dev.sh` brings up can be signed in to from a simulator, which
 * previously needed a real production account every time. GRYT-505.
 *
 * The decisions live in `authServer.ts`. This is the storage around them.
 */

const STORAGE_KEY = "auth-server";

/**
 * Held in a module rather than in React. Every reader is inside an async
 * function partway through signing in, and none is a component — **a stale copy
 * captured in a closure is the failure this exists to prevent.**
 */
let override: AuthOverride = NO_OVERRIDE;

/** What is set now. The default until `loadAuthOverride` has run. */
export function authOverride(): AuthOverride {
  return override;
}

/**
 * Read the override out of storage, before anything asks for the config.
 *
 * `AccountProvider` calls this ahead of restoring a session: a token restored
 * against the default issuer and then refreshed against a custom one is a
 * refresh that fails for a reason nothing on screen explains.
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
