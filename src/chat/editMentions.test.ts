import { describe, expect, it } from "vitest";

import { editDraft, restoreMentions } from "./editMentions";

const channels: Record<string, string> = { chan_a: "general" };
const channelName = (id: string, host: string | null) => (host ? null : channels[id] ?? null);

const roundTrip = (text: string) => restoreMentions(editDraft(text, channelName).text, editDraft(text, channelName));

describe("editing a message with mentions", () => {
  it("shows names, not links", () => {
    const shown = (text: string) => editDraft(text, channelName).text;
    expect(shown("Hey [@Willow](mention:user_7c48), got a sec?")).toBe("Hey @Willow, got a sec?");
    expect(shown("[@Crew](role:crew) standup now")).toBe("@Crew standup now");
    expect(shown("[@everyone](mention:everyone) and [@here](mention:here)")).toBe("@everyone and @here");
    expect(shown("go to [#channel](channel:chan_a) now")).toBe("go to #general now");
    expect(shown("see [#channel](channel:chan_z)")).toBe("see #private-channel");
    expect(shown("see [#channel](channel:gryt.example.com/chan_ab12)")).toBe("see #private-channel");
    expect(shown("code keeps `[@Willow](mention:user_7c48)` as text")).toBe(
      "code keeps `[@Willow](mention:user_7c48)` as text",
    );
  });

  it.each([
    "Hey [@Willow](mention:user_7c48), got a sec?",
    "[@Crew](role:crew) standup now",
    "[@everyone](mention:everyone) standup in 5",
    "[@here](mention:here) anyone around?",
    "go to [#channel](channel:chan_a) now",
    "see [#channel](channel:chan_z) instead",
    "see [#channel](channel:gryt.example.com/chan_ab12)",
    "[@Ada](mention:user_1) and [@everyone](mention:everyone) in [#channel](channel:chan_a)",
    "[@Ada](mention:user_1)[@Bob](mention:user_2)",
    "@Ada typed plainly, then [@Ada](mention:user_1) linked",
    "[#channel](channel:chan_y) and [#channel](channel:chan_z) are both private",
    "no mentions here at all",
    "a code span keeps `[@Willow](mention:user_7c48)` as text",
    "an empty label [](mention:user_1) stays as it is",
  ])("stores the same bytes when saved unchanged: %s", (text) => {
    expect(roundTrip(text)).toBe(text);
  });

  it("keeps each mention's link through an edit around it", () => {
    const draft = editDraft("ping [@Willow](mention:user_7c48) in [#channel](channel:chan_z)", channelName);
    const edited = `please ${draft.text} today`;
    expect(restoreMentions(edited, draft)).toBe(
      "please ping [@Willow](mention:user_7c48) in [#channel](channel:chan_z) today",
    );
  });

  it("leaves a mention typed again as plain text", () => {
    const draft = editDraft("[@Ada](mention:user_1)", channelName);
    expect(restoreMentions(`${draft.text} and @Ada`, draft)).toBe("[@Ada](mention:user_1) and @Ada");
  });

  it("drops a mention that was deleted", () => {
    const draft = editDraft("hi [@Ada](mention:user_1)", channelName);
    expect(restoreMentions("hi there", draft)).toBe("hi there");
  });
});
