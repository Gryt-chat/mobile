import type { SealDecision } from "@gryt/crypto";
import { describe, expect, it } from "vitest";

import { sealingNotice } from "./sealingNotice";

/**
 * The one line that says a message is going out in the open.
 *
 * Everything it can get wrong is quiet. A notice drawn when the conversation
 * *is* encrypted is furniture nobody reads, and then its absence means nothing.
 * A notice not drawn when it is not encrypted is somebody typing into a
 * conversation they believe is private. And a sentence that picks a cause tells
 * a reader their friend got a new phone, when the same event is what a server
 * substituting a key produces.
 */

const names: Record<string, string> = { u1: "Ada", u2: "Grace" };
const nameFor = (id: string) => names[id];

describe("sealingNotice", () => {
  it("says nothing when the conversation seals", () => {
    const decision: SealDecision = {
      kind: "seal",
      recipients: [{ memberId: "u1", publicKey: new Uint8Array(32) }],
    };

    expect(sealingNotice(decision, nameFor)).toBe(null);
  });

  it("says nothing for a channel", () => {
    // Plaintext with nobody blocking it. A channel has no member list to seal
    // to and nothing has gone wrong, so naming somebody would be a lie.
    expect(sealingNotice({ kind: "plaintext", blockedBy: [] }, nameFor)).toBe(null);
  });

  it("names who is stopping it, and why", () => {
    expect(
      sealingNotice(
        { kind: "plaintext", blockedBy: [{ memberId: "u1", reason: "no-key" }] },
        nameFor,
      ),
    ).toBe("Not encrypted: Ada has not published a key.");

    expect(
      sealingNotice(
        { kind: "plaintext", blockedBy: [{ memberId: "u1", reason: "changed" }] },
        nameFor,
      ),
    ).toBe("Not encrypted: Ada's key changed.");

    expect(
      sealingNotice(
        { kind: "plaintext", blockedBy: [{ memberId: "u1", reason: "unusable" }] },
        nameFor,
      ),
    ).toBe("Not encrypted: Ada's key did not check out.");
  });

  it("does not guess at a cause", () => {
    // The two reasons a key changes — a restored seed, or a server swapping it
    // — look identical from here. A sentence saying "got a new device" would be
    // the reassuring half of a guess this client cannot make.
    const notice = sealingNotice(
      { kind: "plaintext", blockedBy: [{ memberId: "u1", reason: "changed" }] },
      nameFor,
    );

    expect(notice).not.toMatch(/device|phone|reinstall|new seed/i);
  });

  it("lists everybody rather than the first one", () => {
    expect(
      sealingNotice(
        {
          kind: "plaintext",
          blockedBy: [
            { memberId: "u1", reason: "no-key" },
            { memberId: "u2", reason: "changed" },
          ],
        },
        nameFor,
      ),
    ).toBe("Not encrypted: Ada has not published a key, Grace's key changed.");
  });

  it("still says something for a reason nobody has worded", () => {
    // The union can grow. A reason with no sentence written for it must not
    // make the notice disappear — that is somebody typing into a conversation
    // they believe is private.
    const notice = sealingNotice(
      {
        kind: "plaintext",
        blockedBy: [{ memberId: "u1", reason: "something-new" as never }],
      },
      nameFor,
    );

    expect(notice).toBe("Not encrypted: Ada has not published a key.");
  });

  it("still says something when the name is not known yet", () => {
    // The member list arrives on its own schedule. A blank where a name should
    // be reads as a bug and buries the part that matters.
    expect(
      sealingNotice(
        { kind: "plaintext", blockedBy: [{ memberId: "stranger", reason: "no-key" }] },
        nameFor,
      ),
    ).toBe("Not encrypted: somebody in this conversation has not published a key.");
  });
});
