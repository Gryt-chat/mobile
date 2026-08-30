import { describe, expect, it } from "vitest";

import type { LocalMessage } from "../connection/outbox";
import { sealedPlaceholder } from "./sealedText";

/**
 * The four states a sealed message can be in, and the three that draw nothing
 * without this.
 *
 * `locked` and `broken` mean opposite things — one is a message from before you
 * arrived, the other is a message that should have opened and did not — and
 * they would look identical if either lost its sentence.
 */

const message = (over: Partial<LocalMessage>): LocalMessage =>
  ({
    conversation_id: "dm_1",
    message_id: "m1",
    sender_server_id: "u1",
    text: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  }) as LocalMessage;

describe("sealedPlaceholder", () => {
  it("has nothing to say about a message that was never sealed", () => {
    expect(sealedPlaceholder(message({ text: "hello" }))).toBe(null);
  });

  it("has nothing to say once it is open", () => {
    // `text` is the message at that point. A placeholder here would draw over
    // the words it was standing in for.
    expect(
      sealedPlaceholder(message({ sealed: "{}", sealedState: "open", text: "hi" })),
    ).toBe(null);
  });

  it("says the three unopened states apart", () => {
    const locked = sealedPlaceholder(message({ sealed: "{}", sealedState: "locked" }));
    const broken = sealedPlaceholder(message({ sealed: "{}", sealedState: "broken" }));
    const opening = sealedPlaceholder(message({ sealed: "{}", sealedState: "opening" }));

    for (const [name, value] of [["locked", locked], ["broken", broken], ["opening", opening]]) {
      expect(value, `${name} draws an empty bubble`).toBeTruthy();
    }
    expect(new Set([locked, broken, opening]).size).toBe(3);
  });

  it("does not call a message from before you joined a failure", () => {
    // It is permanent and ordinary. An alarm here would go off for every member
    // of every group conversation, about nothing.
    const locked = sealedPlaceholder(message({ sealed: "{}", sealedState: "locked" }));

    expect(locked).not.toMatch(/error|failed|could not|broken/i);
  });

  it("says something before the state is set", () => {
    // There is a render between a sealed message arriving and the effect
    // marking it `opening`. An empty bubble in that gap flickers on every page
    // of history.
    expect(sealedPlaceholder(message({ sealed: "{}" }))).toBeTruthy();
  });
});
