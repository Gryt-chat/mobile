import type { PackageFiles } from "@gryt/core";
import { describe, expect, it, vi } from "vitest";

let n = 0;
vi.mock("expo-crypto", () => ({ randomUUID: () => `id-${n++}` }));
vi.mock("expo-file-system", () => ({ File: class {} }));
const { planPhoneImport } = await import("./discordImport");

const files: PackageFiles = {
  names: ["Account/user.json", "Messages/index.json", "Messages/c11/channel.json", "Messages/c11/messages.json"],
  read: async (name) =>
    ({
      "Account/user.json": JSON.stringify({ id: "1" }),
      "Messages/index.json": JSON.stringify({ 11: "Direct Message with kari#0" }),
      "Messages/c11/channel.json": JSON.stringify({ type: 1, recipients: ["1", "2"] }),
      "Messages/c11/messages.json": JSON.stringify([
        { ID: "1", Timestamp: "2023-04-12 21:14:00", Contents: "hei", Attachments: "" },
        { ID: "2", Timestamp: "2023-04-12 21:15:00", Contents: "pics", Attachments: "https://cdn.discordapp.com/a.png" },
        { ID: "3", Timestamp: "2023-04-12 21:16:00", Contents: "nordlys", Attachments: "" },
      ]),
    })[name] ?? "",
};

describe("the phone's Discord import (GRYT-1965)", () => {
  it("splits a DM into messages without files, for the phone, and the ones the desktop sends with their files", async () => {
    const dm = { channelId: "11", name: "kari", userId: "2", avatarUrl: null, messages: 3, files: 1, firstAt: 0, lastAt: 0 };
    const plan = await planPhoneImport(files, dm);
    expect(plan.messages).toHaveLength(3);
    expect(plan.textOnly.map((m) => m.discordId)).toEqual(["1", "3"]);
    expect(plan.withFiles).toBe(1);
  });
});
