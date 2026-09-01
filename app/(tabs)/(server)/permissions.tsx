import { PermissionTemplatesScreen } from "../../../src/permissions/PermissionTemplatesScreen";

/**
 * Channel permission templates, pushed inside the Server tab.
 *
 * Inside `(tabs)` rather than beside it for the reason `channel/[id]` is: the
 * tab bar stays visible, and — the part that is not cosmetic — `ConnectionsProvider`
 * is mounted in the tabs layout, so this is the only place `useServerConnection`
 * resolves. As a root route the screen threw "useConnections must be used inside
 * ConnectionsProvider" the moment it mounted, which typechecks perfectly.
 */
export default PermissionTemplatesScreen;
