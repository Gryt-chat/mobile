import { describe, expect, it } from "vitest";

import { messageCards, toWebhookCardData } from "./cardData";

const host = "chat.example.com";

describe("toWebhookCardData", () => {
  it("turns every file id into an upload URL on the server", () => {
    const data = toWebhookCardData(
      {
        title: "Deploy finished",
        url: "https://ci.example.com/run/1",
        author: { name: "Build runner", icon_file_id: "a1" },
        image_file_id: "i1",
        thumbnail_file_id: "t1",
        footer: { text: "ci.example.com", icon_file_id: "f1" },
      },
      host,
    );

    expect(data.author?.iconUrl).toBe("http://chat.example.com/api/uploads/files/a1");
    expect(data.imageUrl).toBe("http://chat.example.com/api/uploads/files/i1");
    expect(data.thumbnailUrl).toBe("http://chat.example.com/api/uploads/files/t1");
    expect(data.footer?.iconUrl).toBe("http://chat.example.com/api/uploads/files/f1");
    expect(data.url).toBe("https://ci.example.com/run/1");
  });

  it("leaves pictures out when there is no file id or no host", () => {
    const data = toWebhookCardData({ title: "x", author: { name: "a" }, footer: { text: "f" } }, host);
    expect(data.imageUrl).toBeUndefined();
    expect(data.author?.iconUrl).toBeUndefined();
    expect(data.footer?.iconUrl).toBeUndefined();

    expect(toWebhookCardData({ image_file_id: "i1" }, "").imageUrl).toBeUndefined();
  });

  it("keeps fields in order with their inline flag", () => {
    const data = toWebhookCardData(
      {
        fields: [
          { name: "Env", value: "production", inline: true },
          { name: "Changes", value: "**two**", inline: false },
        ],
      },
      host,
    );
    expect(data.fields).toEqual([
      { name: "Env", value: "production", inline: true },
      { name: "Changes", value: "**two**", inline: false },
    ]);
  });
});

describe("messageCards", () => {
  it("is empty for a message without cards", () => {
    expect(messageCards(undefined)).toEqual([]);
    expect(messageCards(null)).toEqual([]);
  });

  it("caps at ten", () => {
    const cards = Array.from({ length: 12 }, (_, i) => ({ title: String(i) }));
    expect(messageCards(cards)).toHaveLength(10);
  });
});
