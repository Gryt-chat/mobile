import { describe, expect, it } from "vitest";

import {
  activeTypers,
  dropTyper,
  noteTyping,
  shouldEmitTyping,
  typingLabel,
  TYPING_THROTTLE_MS,
  TYPING_TIMEOUT_MS,
  type Typer,
} from "./typing";

const someone = (id: string, nickname = id) => ({
  serverUserId: id,
  nickname,
  avatarFileId: null,
});

describe("noteTyping", () => {
  it("records when they said it", () => {
    expect(noteTyping([], someone("a"), 1000)).toEqual([
      { serverUserId: "a", nickname: "a", avatarFileId: null, at: 1000 },
    ]);
  });

  /* Otherwise every keystroke adds a copy and the line reads "a, a and 4
   * more are typing". */
  it("replaces rather than repeats the same person", () => {
    const once = noteTyping([], someone("a"), 1000);
    const twice = noteTyping(once, someone("a"), 4000);
    expect(twice).toHaveLength(1);
    expect(twice[0].at).toBe(4000);
  });

  /* The nickname comes with every event, so a rename lands here without
   * anything having to invalidate it. */
  it("takes the newest name", () => {
    const first = noteTyping([], someone("a", "Old"), 1000);
    expect(noteTyping(first, someone("a", "New"), 2000)[0].nickname).toBe("New");
  });
});

describe("activeTypers", () => {
  const typers: Typer[] = [
    { ...someone("a"), at: 1000 },
    { ...someone("b"), at: 5000 },
  ];

  it("keeps whoever is inside the window", () => {
    expect(activeTypers(typers, 6000).map((t) => t.serverUserId)).toEqual(["a", "b"]);
  });

  it("drops whoever is not", () => {
    expect(activeTypers(typers, 1000 + TYPING_TIMEOUT_MS).map((t) => t.serverUserId)).toEqual(["b"]);
  });

  /* The reason this exists rather than trusting the stop event: a dropped one
   * would otherwise leave somebody typing until the channel was closed. */
  it("expires without anybody having said stop", () => {
    expect(activeTypers(typers, 99_999)).toEqual([]);
  });
});

describe("dropTyper", () => {
  it("removes one and leaves the rest", () => {
    const typers = [
      { ...someone("a"), at: 1 },
      { ...someone("b"), at: 1 },
    ];
    expect(dropTyper(typers, "a").map((t) => t.serverUserId)).toEqual(["b"]);
  });

  it("does nothing for somebody who was not typing", () => {
    expect(dropTyper([], "a")).toEqual([]);
  });
});

describe("shouldEmitTyping", () => {
  /* A short message would never be announced at all if the first keystroke
   * had to wait out the throttle. */
  it("always emits the first one", () => {
    expect(shouldEmitTyping(null, 0)).toBe(true);
  });

  it("holds off inside the throttle", () => {
    expect(shouldEmitTyping(1000, 1000 + TYPING_THROTTLE_MS - 1)).toBe(false);
  });

  it("emits again once it has passed", () => {
    expect(shouldEmitTyping(1000, 1000 + TYPING_THROTTLE_MS)).toBe(true);
  });

  /* The server drops what its rate limit refuses without saying so, so this
   * has to stay comfortably inside it. Thirty in ten seconds. */
  it("stays well inside the server's rate limit", () => {
    expect(10_000 / TYPING_THROTTLE_MS).toBeLessThan(30);
  });
});

describe("typingLabel", () => {
  it("says nothing when nobody is", () => {
    expect(typingLabel([])).toBeNull();
  });

  it("names one and two", () => {
    expect(typingLabel(["Sivert"])).toBe("Sivert is typing…");
    expect(typingLabel(["Sivert", "Ada"])).toBe("Sivert and Ada are typing…");
  });

  it("counts the rest, because the row is one line", () => {
    expect(typingLabel(["Sivert", "Ada", "Grace"])).toBe(
      "Sivert, Ada and 1 more are typing…",
    );
    expect(typingLabel(["Sivert", "Ada", "Grace", "Alan"])).toBe(
      "Sivert, Ada and 2 more are typing…",
    );
  });
});
