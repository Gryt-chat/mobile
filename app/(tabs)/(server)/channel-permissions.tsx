import { ChannelScopeScreen } from "../../../src/permissions/ChannelScopeScreen";

/**
 * Who can use one channel, pushed inside the Server tab.
 *
 * Under `(tabs)` rather than at the root, like `channel/[id]` and
 * `permissions`: `ConnectionsProvider` is mounted in the tabs layout, so this
 * is the only place `useServerConnection` resolves. A root route typechecks and
 * throws on mount.
 */
export default ChannelScopeScreen;
