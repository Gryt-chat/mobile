import { ChannelScreen } from "../../../../src/shell/ChannelScreen";

/**
 * A text channel, pushed over the tab bar.
 *
 * Inside `(tabs)` rather than beside it, so the bar stays visible while you
 * read a channel — which is the arrangement the reference has, and the reason
 * the root layout is a Stack around the tabs rather than the tabs themselves.
 */
export default ChannelScreen;
