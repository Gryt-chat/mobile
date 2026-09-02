import { AuthCallbackScreen } from "../../src/account/AuthCallbackScreen";

/**
 * `gryt://auth/callback`, the redirect Keycloak sends people back to.
 *
 * The redirect URI is registered on the `gryt-web` client and hardcoded in
 * `src/account/authServer.ts`, so this path is not ours to rename.
 */
export default AuthCallbackScreen;
