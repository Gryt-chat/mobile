import { describe, expect, it } from "vitest";

import { aroundCount, occupancy, occupiedRooms, presenceGroups } from "./presence";
import type { Channel, Member } from "./types";

function member(over: Partial<Member> & { serverUserId: string }): Member {
  return { nickname: "Someone", ...over };
}

function channel(id: string, type: Channel["type"] = "voice"): Channel {
  return { id, name: id, type };
}

describe("occupiedRooms", () => {
  it("hangs each member off the room the server says they are in", () => {
    const rooms = occupiedRooms(
      [channel("lounge"), channel("standup")],
      [
        member({ serverUserId: "u1", nickname: "Mari", voiceChannelId: "lounge" }),
        member({ serverUserId: "u2", nickname: "Ola", voiceChannelId: "lounge" }),
      ],
    );

    expect(rooms).toHaveLength(1);
    expect(rooms[0].channel.id).toBe("lounge");
    expect(rooms[0].members.map((m) => m.nickname)).toEqual(["Mari", "Ola"]);
  });

  /* The whole reason the strip can be absent. An empty room returned with a
   * count of zero would put "0 here" at the top of a quiet server. */
  it("drops a room nobody is in", () => {
    const rooms = occupiedRooms([channel("lounge"), channel("standup")], []);

    expect(rooms).toEqual([]);
  });

  /* The server writes `onlineClient?.voiceChannelId || ''`, so everybody not in
   * a call shares the empty string. Grouping on it would collect the entire
   * server into one room with no name. */
  it("ignores everybody who is not in a call", () => {
    const rooms = occupiedRooms(
      [channel("lounge")],
      [
        member({ serverUserId: "u1", voiceChannelId: "" }),
        member({ serverUserId: "u2" }),
        member({ serverUserId: "u3", voiceChannelId: "lounge" }),
      ],
    );

    expect(rooms).toHaveLength(1);
    expect(rooms[0].members.map((m) => m.serverUserId)).toEqual(["u3"]);
  });

  it("ignores a channel the server no longer has", () => {
    const rooms = occupiedRooms(
      [channel("lounge")],
      [member({ serverUserId: "u1", voiceChannelId: "deleted" })],
    );

    expect(rooms).toEqual([]);
  });

  it("does not treat a text channel as a room, whatever a member claims", () => {
    const rooms = occupiedRooms(
      [channel("general", "text")],
      [member({ serverUserId: "u1", voiceChannelId: "general" })],
    );

    expect(rooms).toEqual([]);
  });

  it("puts the busiest room first", () => {
    const rooms = occupiedRooms(
      [channel("lounge"), channel("gaming")],
      [
        member({ serverUserId: "u1", voiceChannelId: "gaming" }),
        member({ serverUserId: "u2", voiceChannelId: "lounge" }),
        member({ serverUserId: "u3", voiceChannelId: "lounge" }),
      ],
    );

    expect(rooms.map((r) => r.channel.id)).toEqual(["lounge", "gaming"]);
  });

  /* Otherwise two equally busy rooms swap places every time anybody anywhere
   * joins or leaves, under the thumb of whoever is reading the list. */
  it("keeps the server's own order when two rooms are equally busy", () => {
    const rooms = occupiedRooms(
      [channel("standup"), channel("lounge")],
      [
        member({ serverUserId: "u1", voiceChannelId: "lounge" }),
        member({ serverUserId: "u2", voiceChannelId: "standup" }),
      ],
    );

    expect(rooms.map((r) => r.channel.id)).toEqual(["standup", "lounge"]);
  });
});

describe("occupancy", () => {
  it("counts each room, and says nothing about the empty ones", () => {
    const counts = occupancy(
      [channel("lounge"), channel("standup")],
      [
        member({ serverUserId: "u1", voiceChannelId: "lounge" }),
        member({ serverUserId: "u2", voiceChannelId: "lounge" }),
      ],
    );

    expect(counts.get("lounge")).toBe(2);
    expect(counts.has("standup")).toBe(false);
  });
});

describe("presenceGroups", () => {
  it("orders the groups by how present somebody is", () => {
    const groups = presenceGroups([
      member({ serverUserId: "u1", status: "offline" }),
      member({ serverUserId: "u2", status: "afk" }),
      member({ serverUserId: "u3", status: "online" }),
      member({ serverUserId: "u4", status: "in_voice", voiceChannelId: "lounge" }),
    ]);

    expect(groups.map((g) => g.key)).toEqual(["voice", "around", "away", "offline"]);
  });

  /* The server derives `status` from `hasJoinedChannel` and sends the channel
   * separately, so the two can disagree while somebody is connecting. Reading
   * the same field the strip reads is what stops the drawer and the strip
   * contradicting each other about who is in a room. */
  it("counts somebody as in voice on the channel, not on the status", () => {
    const groups = presenceGroups([
      member({ serverUserId: "u1", status: "online", voiceChannelId: "lounge" }),
    ]);

    expect(groups[0].key).toBe("voice");
  });

  it("does not head an empty group", () => {
    const groups = presenceGroups([member({ serverUserId: "u1", status: "online" })]);

    expect(groups.map((g) => g.key)).toEqual(["around"]);
  });

  it("treats a member with no status at all as offline", () => {
    const groups = presenceGroups([member({ serverUserId: "u1" })]);

    expect(groups.map((g) => g.key)).toEqual(["offline"]);
  });

  it("sorts each group by name, ignoring case", () => {
    const groups = presenceGroups([
      member({ serverUserId: "u1", nickname: "ola", status: "online" }),
      member({ serverUserId: "u2", nickname: "Mari", status: "online" }),
    ]);

    expect(groups[0].members.map((m) => m.nickname)).toEqual(["Mari", "ola"]);
  });
});

describe("aroundCount", () => {
  it("counts everybody who is not offline as present", () => {
    const counted = aroundCount([
      member({ serverUserId: "u1", status: "online" }),
      member({ serverUserId: "u2", status: "in_voice", voiceChannelId: "lounge" }),
      member({ serverUserId: "u3", status: "afk" }),
      member({ serverUserId: "u4", status: "offline" }),
      member({ serverUserId: "u5" }),
    ]);

    expect(counted).toEqual({ present: 3, total: 5 });
  });
});
