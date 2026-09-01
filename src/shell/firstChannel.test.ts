import { describe, expect, it } from "vitest";

import { firstTextChannelId } from "./firstChannel";
import type { Channel, SidebarItem } from "../connection/types";

/**
 * Which channel a tablet opens on arriving at a server.
 *
 * The cases that matter are the ones where the obvious answer is wrong.
 * `channels[0]` is not the first row — the sidebar is the real ordering and it
 * is not sorted — and the first row is not always somewhere you can go, because
 * a voice channel opens a microphone rather than a page.
 */
const channels: Channel[] = [
  { id: "random", name: "Random", type: "text" },
  { id: "lounge", name: "Lounge", type: "voice" },
  { id: "general", name: "General", type: "text" },
];

const item = (channelId: string, position: number): SidebarItem => ({
  id: `item_${channelId}`,
  kind: "channel",
  channelId,
  position,
});

describe("firstTextChannelId", () => {
  it("takes the sidebar's order, not the channel list's", () => {
    const sidebar = [item("general", 0), item("lounge", 1), item("random", 2)];
    expect(firstTextChannelId({ status: "ready", channels, sidebar })).toBe("general");
  });

  it("sorts by position rather than trusting the order it arrived in", () => {
    const sidebar = [item("random", 9), item("general", 1)];
    expect(firstTextChannelId({ status: "ready", channels, sidebar })).toBe("general");
  });

  it("skips a voice channel that sorts first", () => {
    const sidebar = [item("lounge", 0), item("general", 1)];
    expect(firstTextChannelId({ status: "ready", channels, sidebar })).toBe("general");
  });

  it("skips a separator, which is a heading and holds nothing", () => {
    const sidebar: SidebarItem[] = [
      { id: "sep", kind: "separator", label: "Talking", position: 0 },
      item("general", 1),
    ];
    expect(firstTextChannelId({ status: "ready", channels, sidebar })).toBe("general");
  });

  it("skips a sidebar row naming a channel this person cannot see", () => {
    /* The server omits a gated channel from `channels` and leaves the item, so
       the lookup misses and the next row is the first one they have. */
    const sidebar = [item("staff", 0), item("general", 1)];
    expect(firstTextChannelId({ status: "ready", channels, sidebar })).toBe("general");
  });

  it("falls back to the channel list when the server sends no sidebar", () => {
    expect(firstTextChannelId({ status: "ready", channels, sidebar: [] })).toBe("random");
  });

  it("answers null before the connection is ready", () => {
    /* The list is empty because nothing has arrived, not because there is
       nothing. Acting on it would move somebody on every reconnect. */
    const sidebar = [item("general", 0)];
    expect(firstTextChannelId({ status: "connecting", channels, sidebar })).toBeNull();
    expect(firstTextChannelId({ status: "joining", channels, sidebar })).toBeNull();
  });

  it("answers null for a server with only voice channels", () => {
    const voiceOnly: Channel[] = [{ id: "lounge", name: "Lounge", type: "voice" }];
    expect(firstTextChannelId({ status: "ready", channels: voiceOnly, sidebar: [] })).toBeNull();
  });

  it("answers null for a server with no channels at all", () => {
    expect(firstTextChannelId({ status: "ready", channels: [], sidebar: [] })).toBeNull();
  });
});
