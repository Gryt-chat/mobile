import { describe, expect, it } from "vitest";

import { mlsDmToast } from "./mlsDmToast";

const HOST = "example.test";
const base = {
  active: false,
  host: HOST,
  serverName: "Test Server",
  channel: undefined,
  senderName: undefined,
  preview: (text: string) => text,
};

describe("mlsDmToast", () => {
  it("toasts a decoded message with its preview", () => {
    expect(
      mlsDmToast(
        { conversationId: "c1", senderId: "u1", content: { type: "message", text: "hey" } },
        base,
      ),
    ).toEqual({ title: "Test Server", description: "hey" });
  });

  it("puts the sender's name in front when one is known", () => {
    expect(
      mlsDmToast(
        { conversationId: "c1", senderId: "u1", content: { type: "message", text: "hey" } },
        { ...base, senderName: "Alex" },
      ),
    ).toEqual({ title: "Test Server", description: "Alex: hey" });
  });

  it("runs the text through the given preview function", () => {
    expect(
      mlsDmToast(
        { conversationId: "c1", senderId: "u1", content: { type: "message", text: "**hey**" } },
        { ...base, preview: () => "hey" },
      ),
    ).toEqual({ title: "Test Server", description: "hey" });
  });

  it("says \"New message\" with no text for a message that couldn't be decrypted", () => {
    expect(mlsDmToast({ conversationId: "c1", senderId: "u1", content: null }, base)).toEqual({
      title: "Test Server",
      description: "New message",
    });
  });

  it("says nothing while looking at the server", () => {
    expect(
      mlsDmToast(
        { conversationId: "c1", senderId: "u1", content: { type: "message", text: "hey" } },
        { ...base, active: true },
      ),
    ).toBeNull();
  });

  it("says nothing for a muted conversation", () => {
    expect(
      mlsDmToast(
        { conversationId: "c1", senderId: "u1", content: { type: "message", text: "hey" } },
        { ...base, channel: { id: "c1", defaultNotificationLevel: "none" } },
      ),
    ).toBeNull();
  });

  it("says nothing for a message that couldn't be decrypted in a muted conversation either", () => {
    expect(
      mlsDmToast(
        { conversationId: "c1", senderId: "u1", content: null },
        { ...base, channel: { id: "c1", defaultNotificationLevel: "none" } },
      ),
    ).toBeNull();
  });

  it("says nothing for a conversation set to mentions only, which a DM never triggers", () => {
    expect(
      mlsDmToast(
        { conversationId: "c1", senderId: "u1", content: { type: "message", text: "hey" } },
        { ...base, channel: { id: "c1", defaultNotificationLevel: "mentions" } },
      ),
    ).toBeNull();
  });
});
