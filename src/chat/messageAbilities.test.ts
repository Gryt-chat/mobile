import { describe, expect, it } from "vitest";

import type { LocalMessage } from "../connection/outbox";
import { abilitiesFor, quoteOf, summariseReactions } from "./messageAbilities";

function message(over: Partial<LocalMessage> = {}): LocalMessage {
  return {
    conversation_id: "c1",
    message_id: "m1",
    sender_server_id: "u1",
    text: "hello",
    created_at: new Date(0).toISOString(),
    ...over,
  };
}

describe("abilitiesFor", () => {
  it("offers everything but report on your own acknowledged message", () => {
    expect(abilitiesFor(message(), "u1", false)).toEqual({
      canReply: true,
      canReact: true,
      canEdit: true,
      canDelete: true,
      canCopy: true,
      /* Not your own. The server answers `chat:error` to that, so offering it
         would be a row that is always refused. */
      canReport: false,
    });
  });

  it("does not offer edit or delete on somebody else's", () => {
    const a = abilitiesFor(message({ sender_server_id: "u2" }), "u1", false);

    expect(a.canEdit).toBe(false);
    expect(a.canDelete).toBe(false);
    expect(a.canReply).toBe(true);
    expect(a.canReact).toBe(true);
  });

  /* The row is on screen and greyed, and none of these can name a message id
   * the server would recognise. Four buttons that fail is worse than one that
   * works. */
  it("offers only copy on a message the server has not acknowledged", () => {
    const a = abilitiesFor(message({ pending: true }), "u1", false);

    expect(a).toEqual({
      canReply: false,
      canReact: false,
      canEdit: false,
      canDelete: false,
      canCopy: true,
      canReport: false,
    });
  });

  it("offers report on somebody else's message and not on your own", () => {
    expect(abilitiesFor(message({ sender_server_id: "u2" }), "u1", false).canReport).toBe(true);
    expect(abilitiesFor(message(), "u1", false).canReport).toBe(false);
  });

  it("does not offer report on a system announcement", () => {
    /* Nobody wrote it, so there is nobody for a report to be about. */
    expect(abilitiesFor(message({ sender_server_id: "u2" }), "u1", true).canReport).toBe(false);
  });

  it("does not offer report on a message the server has not acknowledged", () => {
    /* There is no `message_id` for `chat:report` to name. */
    const draft = message({ sender_server_id: "u2", pending: true });
    expect(abilitiesFor(draft, "u1", false).canReport).toBe(false);
  });

  it("offers report when we do not know who we are yet", () => {
    /* `me` is null between the join and the session landing. Nothing is
       "mine" then, so report is offered and the server has the final say. */
    expect(abilitiesFor(message(), null, false).canReport).toBe(true);
  });

  it("offers only copy on one that failed to send", () => {
    const a = abilitiesFor(message({ failed: true }), "u1", false);

    expect(a.canReact).toBe(false);
    expect(a.canCopy).toBe(true);
  });

  it("treats a local draft id as unacknowledged", () => {
    const a = abilitiesFor(message({ message_id: "pending:abc" }), "u1", false);

    expect(a.canReact).toBe(false);
  });

  /* An announcement has no author to be, so it is nobody's to edit — including
   * the owner's. Reacting to one is harmless and people do it. */
  it("does not let anyone edit or delete a system announcement", () => {
    const a = abilitiesFor(message({ sender_server_id: "system" }), "system", true);

    expect(a.canEdit).toBe(false);
    expect(a.canDelete).toBe(false);
    expect(a.canReply).toBe(false);
    expect(a.canReact).toBe(true);
  });

  it("does not offer edit on a message with no words in it", () => {
    const a = abilitiesFor(message({ text: "   " }), "u1", false);

    expect(a.canEdit).toBe(false);
    expect(a.canCopy).toBe(false);
    expect(a.canDelete).toBe(true);
  });

  it("offers nothing personal when you are nobody yet", () => {
    const a = abilitiesFor(message(), null, false);

    expect(a.canEdit).toBe(false);
    expect(a.canDelete).toBe(false);
  });
});

describe("summariseReactions", () => {
  /* The server sends null rather than an empty array when there are none, which
   * is the case that turns a map into a crash. */
  it("survives the null the server actually sends", () => {
    expect(summariseReactions(null, "u1")).toEqual([]);
    expect(summariseReactions(undefined, "u1")).toEqual([]);
  });

  it("says which ones you are in", () => {
    const out = summariseReactions(
      [
        { src: "yes", amount: 2, users: ["u1", "u2"] },
        { src: "no", amount: 1, users: ["u2"] },
      ],
      "u1",
    );

    expect(out).toEqual([
      { src: "yes", count: 2, mine: true },
      { src: "no", count: 1, mine: false },
    ]);
  });

  /* A purge deletes a user's reactions without re-broadcasting every message,
   * so a count can reach zero with a stale `users` array still on it. */
  it("drops one that adds up to nothing", () => {
    const out = summariseReactions([{ src: "gone", amount: 0, users: ["u2"] }], "u1");

    expect(out).toEqual([]);
  });

  it("does not claim a reaction is yours when you are nobody", () => {
    const out = summariseReactions([{ src: "yes", amount: 1, users: ["u1"] }], null);

    expect(out[0].mine).toBe(false);
  });
});

describe("quoteOf", () => {
  it("collapses a message to one line", () => {
    expect(quoteOf({ ...message({ text: "one\ntwo   three" }) })).toBe("one two three");
  });

  /* The stub has one line and no room to make sense of a mark. */
  it("quotes the words rather than the markdown", () => {
    expect(quoteOf(message({ text: "**shipped** the [PR](https://a.b)" }))).toBe(
      "shipped the PR",
    );
    expect(quoteOf(message({ text: "```\nconst a = 1;\n```" }))).toBe("const a = 1;");
  });

  it("describes a message that is only an attachment", () => {
    expect(quoteOf(message({ text: null, attachments: ["f1"] }))).toBe("an attachment");
    expect(quoteOf(message({ text: null, attachments: ["f1", "f2"] }))).toBe("2 attachments");
  });

  /* A stub with nothing in it reads as a loading state. */
  it("never returns an empty string", () => {
    expect(quoteOf(message({ text: "   " }))).toBe("a message");
    expect(quoteOf(undefined)).toBe("a message");
  });
});
