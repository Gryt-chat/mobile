import { BanListScreen } from "../../../src/moderation/BanListScreen";

/**
 * The ban list, pushed inside the Server tab.
 *
 * Inside `(tabs)` for the same reason `permissions` is: `ConnectionsProvider`
 * is mounted in the tabs layout, so this is the only place `useServerConnection`
 * resolves. As a root route it typechecks and throws on mount.
 */
export default BanListScreen;
