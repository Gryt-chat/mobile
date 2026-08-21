import { describe, expect, it } from "vitest";

import { isSystemMessage, resolveMentions, SYSTEM_SENDER_ID } from "./system";

const message = (sender: string) =>
  ({ sender_server_id: sender }) as Parameters<typeof isSystemMessage>[0];

describe("isSystemMessage", () => {
  it("matches the id the server actually sends", () => {
    expect(isSystemMessage(message(SYSTEM_SENDER_ID))).toBe(true);
  });

  it("does not match a person", () => {
    expect(isSystemMessage(message("user_224d63d2"))).toBe(false);
  });

  it("does not match a webhook, which is a different thing again", () => {
    expect(isSystemMessage(message("webhook:abc"))).toBe(false);
  });
});

describe("resolveMentions", () => {
  it("unwraps the construct the server puts in its own announcements", () => {
    expect(
      resolveMentions("[@You](mention:user_224d63d2-ec1c-4547-b5e7-752a6c0ef402) joined the server"),
    ).toBe("@You joined the server");
  });

  it("handles more than one in a line", () => {
    expect(resolveMentions("[@a](mention:1) and [@b](mention:2)")).toBe("@a and @b");
  });

  it("leaves ordinary text alone", () => {
    expect(resolveMentions("no mentions here")).toBe("no mentions here");
  });

  it("leaves a real link alone — only mention: targets are unwrapped", () => {
    const link = "[the docs](https://docs.gryt.chat)";
    expect(resolveMentions(link)).toBe(link);
  });

  it("keeps the @, because the label carries it", () => {
    expect(resolveMentions("[@Sivert](mention:u1)")).toBe("@Sivert");
  });
});
