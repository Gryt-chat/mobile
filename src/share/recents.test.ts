import { describe, expect, it } from "vitest";

import {
  MAX_RECENTS,
  forget,
  parseRecents,
  rank,
  remember,
  type RecentChannel,
} from "./recents";

const entry = (over: Partial<RecentChannel> = {}): RecentChannel => ({
  host: "gryt.example",
  channelId: "general",
  channelName: "general",
  serverName: "Example",
  at: 1000,
  ...over,
});

describe("remember", () => {
  it("puts a new channel at the front", () => {
    const list = [entry({ channelId: "old", at: 900 })];
    expect(remember(list, entry({ channelId: "new", at: 1000 }))[0]?.channelId).toBe("new");
  });

  /* The point of a recents list: sending in the same place twice should leave
     one row, not two. */
  it("moves a channel already in the list rather than repeating it", () => {
    const list = [entry({ channelId: "a" }), entry({ channelId: "b" })];
    const next = remember(list, entry({ channelId: "b", at: 2000 }));
    expect(next.map((item) => item.channelId)).toEqual(["b", "a"]);
  });

  /* Same channel id on a different server is a different channel. Ids are only
     unique within a server, and merging them would send somebody's picture to
     the wrong place. */
  it("keeps the same channel id on two servers apart", () => {
    const list = [entry({ host: "one.example" })];
    const next = remember(list, entry({ host: "two.example" }));
    expect(next).toHaveLength(2);
  });

  it("carries the newest names, not the stored ones", () => {
    const list = [entry({ channelName: "old-name" })];
    const next = remember(list, entry({ channelName: "new-name", at: 2000 }));
    expect(next[0]?.channelName).toBe("new-name");
  });

  it("caps the list", () => {
    let list: RecentChannel[] = [];
    for (let i = 0; i < MAX_RECENTS + 5; i++) {
      list = remember(list, entry({ channelId: `c${i}`, at: i }));
    }
    expect(list).toHaveLength(MAX_RECENTS);
    expect(list[0]?.channelId).toBe(`c${MAX_RECENTS + 4}`);
  });
});

describe("rank", () => {
  it("sorts newest first", () => {
    const list = [entry({ channelId: "a", at: 1 }), entry({ channelId: "b", at: 5 })];
    expect(rank(list).map((item) => item.channelId)).toEqual(["b", "a"]);
  });

  it("does not mutate what it was given", () => {
    const list = [entry({ channelId: "a", at: 1 }), entry({ channelId: "b", at: 5 })];
    rank(list);
    expect(list.map((item) => item.channelId)).toEqual(["a", "b"]);
  });
});

describe("forget", () => {
  it("drops every channel on one server", () => {
    const list = [
      entry({ host: "one.example", channelId: "a" }),
      entry({ host: "one.example", channelId: "b" }),
      entry({ host: "two.example", channelId: "c" }),
    ];
    expect(forget(list, "one.example").map((item) => item.channelId)).toEqual(["c"]);
  });

  it("leaves everything alone for a server that is not in the list", () => {
    const list = [entry()];
    expect(forget(list, "nowhere.example")).toEqual(list);
  });
});

describe("parseRecents", () => {
  it("reads a list back", () => {
    expect(parseRecents([entry()])).toEqual([entry()]);
  });

  it("treats anything that is not a list as empty", () => {
    expect(parseRecents(null)).toEqual([]);
    expect(parseRecents({ host: "gryt.example" })).toEqual([]);
    expect(parseRecents("[]")).toEqual([]);
  });

  /* One bad row is a row, not a launch failure. */
  it("drops rows missing what a tap needs", () => {
    const raw = [entry(), { host: "gryt.example" }, { channelId: "general", at: 1 }];
    expect(parseRecents(raw)).toEqual([entry()]);
  });

  it("survives names written by an older build that had none", () => {
    const raw = [{ host: "gryt.example", channelId: "general", at: 5 }];
    expect(parseRecents(raw)).toEqual([
      { host: "gryt.example", channelId: "general", channelName: "", serverName: "", at: 5 },
    ]);
  });

  it("sorts and caps what it read", () => {
    const raw = Array.from({ length: MAX_RECENTS + 3 }, (_, i) =>
      entry({ channelId: `c${i}`, at: i }),
    );
    const parsed = parseRecents(raw);
    expect(parsed).toHaveLength(MAX_RECENTS);
    expect(parsed[0]?.channelId).toBe(`c${MAX_RECENTS + 2}`);
  });
});
