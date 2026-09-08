import type { Channel, SidebarItem } from "../connection/types";

/**
 * The channel a tablet opens when you arrive at a server. **The first text channel in
 * sidebar order**: `position` is the real ordering, a `separator` is a heading, and
 * **text, because tapping a voice channel opens a microphone.**
 */
export function firstTextChannelId(params: {
  /** The connection's status. Only "ready" carries a trustworthy list. */
  status: string;
  channels: readonly Channel[];
  sidebar: readonly SidebarItem[];
}): string | null {
  const { status, channels, sidebar } = params;

  /* Before the join settles the list is empty because nothing has arrived, not because
   * the server has none. Acting on that sends somebody somewhere arbitrary. */
  if (status !== "ready") return null;

  const byId = new Map(channels.map((c) => [c.id, c]));

  const ordered =
    sidebar.length > 0
      ? [...sidebar]
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((item) => (item.kind === "channel" ? byId.get(item.channelId ?? "") : undefined))
      : channels;

  for (const channel of ordered) {
    /* A sidebar can name a channel this person cannot see: the server omits it from
     * `channels` and leaves the item. The next row is the first they have. */
    if (channel?.type === "text") return channel.id;
  }

  return null;
}
