import { ServerSettingsScreen } from "../../../../src/servers/admin/ServerSettingsScreen";

/**
 * The Server settings front door, pushed inside the Server tab. `ConnectionsProvider`
 * is mounted in the tabs layout, so a root route typechecks and throws on mount.
 */
export default ServerSettingsScreen;
