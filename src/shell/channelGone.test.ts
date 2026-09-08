import { describe, expect, it } from "vitest";

import { conversationIsGone } from "./channelGone";

/**
 * When the conversation on screen has stopped existing for this person — a channel denied
 * `read_messages` drops out of the list exactly as a deleted one does. The cases that
 * matter are the ones where it must answer *no*.
 */
const ready = {
  status: "ready",
  channelIds: ["general", "random"],
  directConversationIds: ["dm_abc"],
};

describe("conversationIsGone", () => {
  it("is true for a channel that has left the list", () => {
    expect(conversationIsGone({ ...ready, conversationId: "staff" })).toBe(true);
  });

  it("is false for a channel that is still there", () => {
    expect(conversationIsGone({ ...ready, conversationId: "general" })).toBe(false);
  });

  it("is false while the connection is not ready", () => {
    // The list is empty here because nothing has arrived, not because the channel went
    // away. Leaving on this would bounce somebody out on every reconnect.
    for (const status of ["idle", "connecting", "joining", "refused", "error"]) {
      expect(
        conversationIsGone({ ...ready, status, channelIds: [], conversationId: "general" }),
      ).toBe(false);
    }
  });

  it("is false for a direct message, which is never in the channel list", () => {
    expect(conversationIsGone({ ...ready, conversationId: "dm_abc" })).toBe(false);
  });

  it("is false when there is no conversation on screen", () => {
    expect(conversationIsGone({ ...ready, conversationId: null })).toBe(false);
    expect(conversationIsGone({ ...ready, conversationId: undefined })).toBe(false);
  });

  it("is true once a server with channels sends a list without this one", () => {
    // The shape of a scope being applied while somebody reads: ready both
    // before and after, and the channel is only in the first list.
    const before = conversationIsGone({ ...ready, channelIds: ["general", "staff"], conversationId: "staff" });
    const after = conversationIsGone({ ...ready, channelIds: ["general"], conversationId: "staff" });
    expect(before).toBe(false);
    expect(after).toBe(true);
  });
});
