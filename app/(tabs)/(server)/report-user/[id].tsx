import { ReportUserScreen } from "../../../../src/moderation/ReportUserScreen";

/**
 * The report form, pushed inside the Server tab.
 *
 * Inside `(tabs)` like `/ban/[id]`: `ConnectionsProvider` is mounted in the
 * tabs layout, so this is the only place `useServerConnection` resolves.
 */
export default ReportUserScreen;
