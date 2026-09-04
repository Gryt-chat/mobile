import type { Channel, SidebarItem } from "../connection/types";

/**
 * The channel a tablet opens when you arrive at a server, so the right-hand
 * pane is not two thirds of an iPad saying "Pick a channel on the left".
 *
 * **The first text channel in sidebar order**, and all three words matter.
 * `sidebar_items` is the real ordering and has to be sorted by `position`; a
 * `separator` is a heading rather than a container, so this reads the sorted
 * list linearly rather than building a tree that does not exist.
 *
 * **Text, because a voice channel is not somewhere you navigate.** Tapping one
 * opens a microphone, so a server whose first row is Lounge would put you in a
 * call for having opened it.
 *
 * Pure and on its own so it can be tested — anything importing the screen pulls
 * in react-native, whose Flow syntax vitest cannot parse.
 */
export function firstTextChannelId(params: {
  /** The connection's status. Only "ready" carries a trustworthy list. */
  status: string;
  channels: readonly Channel[];
  sidebar: readonly SidebarItem[];
}): string | null {
  const { status, channels, sidebar } = params;

  /* Before the join settles the list is empty because nothing has arrived, not
   * because the server has no channels. Acting on that would send somebody
   * somewhere arbitrary on every reconnect — the same caveat
   * `conversationIsGone` is built around. */
  if (status !== "ready") return null;

  const byId = new Map(channels.map((c) => [c.id, c]));

  const ordered =
    sidebar.length > 0
      ? [...sidebar]
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((item) => (item.kind === "channel" ? byId.get(item.channelId ?? "") : undefined))
      : channels;

  for (const channel of ordered) {
    /* A sidebar can name a channel this person cannot see: the server omits it
     * from `channels` and leaves the item, so the lookup misses. Skipping is
     * the whole handling — the next row is the first one they actually have. */
    if (channel?.type === "text") return channel.id;
  }

  return null;
}
