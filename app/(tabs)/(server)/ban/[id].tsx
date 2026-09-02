import { BanScreen } from "../../../../src/moderation/BanScreen";

/**
 * The ban form, pushed inside the Server tab.
 *
 * Inside `(tabs)` like `/bans` and `/permissions`: `ConnectionsProvider` is
 * mounted in the tabs layout, so this is the only place `useServerConnection`
 * resolves.
 */
export default BanScreen;
