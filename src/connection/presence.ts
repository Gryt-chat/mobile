import type { Channel, Member } from "./types";

/**
 * Who is where, derived from the member list.
 *
 * Pure and in its own file for the reason `members.ts` is: the screen that
 * draws this reaches a socket and React, and neither loads in a test. The cases
 * worth having are an empty `voiceChannelId`, a room the server has since
 * deleted, and the ordering.
 *
 * **Presence only. Not activity.** `isMuted` and `isDeafened` arrive on the
 * same payload and nothing here reads them: they belong to the voice sheet,
 * which is the only place the app subscribes to them, so the server tab costs
 * nothing in re-renders while somebody across the server taps mute.
 */

export interface VoiceRoom {
  channel: Channel;
  /** Everyone the server says is in it. Never empty — see `occupiedRooms`. */
  members: Member[];
}

/**
 * The voice channels with somebody in them, busiest first.
 *
 * Empty rooms are dropped rather than returned with a count of zero, because
 * the strip that draws this is not supposed to exist when nothing is happening
 * — "0 here" is a row that says nothing and takes up the top of the screen to
 * say it.
 *
 * Ties keep the order `channels` came in, which is the order the server put
 * them in `sidebar_items`. A room that is joined and left repeatedly would
 * otherwise swap places with its neighbour on every change.
 */
export function occupiedRooms(channels: Channel[], members: Member[]): VoiceRoom[] {
  const voice = channels.filter((c) => c.type === "voice");
  const order = new Map(voice.map((c, index) => [c.id, index]));

  const byChannel = new Map<string, Member[]>();
  for (const member of members) {
    /* `voiceChannelId` is `''` for everybody not in a call — the server writes
     * `onlineClient?.voiceChannelId || ''`. Grouping on it would collect the
     * whole server into one room named nothing. */
    const id = member.voiceChannelId;
    if (!id) continue;

    /* A channel the server has deleted, or one from the server you just left.
     * Skipped rather than drawn nameless: a card with no name is not a room
     * anybody can decide to join. */
    if (!order.has(id)) continue;

    const existing = byChannel.get(id);
    if (existing) existing.push(member);
    else byChannel.set(id, [member]);
  }

  return voice
    .filter((c) => byChannel.has(c.id))
    .map((channel) => ({ channel, members: byChannel.get(channel.id)! }))
    .sort((a, b) => {
      const size = b.members.length - a.members.length;
      if (size !== 0) return size;
      return order.get(a.channel.id)! - order.get(b.channel.id)!;
    });
}

/** How many people are in each voice channel, for the rows in the list. */
export function occupancy(channels: Channel[], members: Member[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const room of occupiedRooms(channels, members)) {
    counts.set(room.channel.id, room.members.length);
  }
  return counts;
}

export type PresenceKey = "voice" | "around" | "away" | "offline";

export interface PresenceGroup {
  key: PresenceKey;
  label: string;
  members: Member[];
}

const LABELS: Record<PresenceKey, string> = {
  voice: "In voice",
  around: "Around",
  away: "Away",
  offline: "Offline",
};

/**
 * Everyone, grouped by how present they are.
 *
 * Sorted by presence rather than by rank, because the question this drawer
 * answers is "who is about", and an owner who has been offline for a week is
 * not the answer to it. Role is still drawn on the row.
 *
 * **"In voice" is decided by `voiceChannelId`, not by `status`.** The server
 * derives `status: 'in_voice'` from `hasJoinedChannel` and sends the channel
 * separately, so the two can disagree for a moment while somebody is
 * connecting. Reading the same field the strip reads is what stops the drawer
 * and the strip contradicting each other about who is in a room.
 *
 * Empty groups are dropped.
 */
export function presenceGroups(members: Member[]): PresenceGroup[] {
  const buckets: Record<PresenceKey, Member[]> = {
    voice: [],
    around: [],
    away: [],
    offline: [],
  };

  for (const member of members) {
    if (member.voiceChannelId) buckets.voice.push(member);
    else if (member.status === "afk") buckets.away.push(member);
    else if (member.status === "offline" || member.status === undefined) {
      buckets.offline.push(member);
    } else buckets.around.push(member);
  }

  const byName = (a: Member, b: Member) =>
    a.nickname.localeCompare(b.nickname, undefined, { sensitivity: "base" });

  return (Object.keys(buckets) as PresenceKey[])
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({
      key,
      label: LABELS[key],
      members: buckets[key].sort(byName),
    }));
}

/** How many people are on the server at all, and how many of those are here. */
export function aroundCount(members: Member[]): { present: number; total: number } {
  const present = members.filter(
    (m) => m.status !== undefined && m.status !== "offline",
  ).length;
  return { present, total: members.length };
}
