import type { MlsDmContent, PackageFiles } from "@gryt/core";
import { describe, expect, it, vi } from "vitest";

let n = 0;
vi.mock("expo-crypto", () => ({ randomUUID: () => `id-${n++}` }));
vi.mock("expo-file-system", () => ({ File: class {} }));
vi.useFakeTimers();
const { planPhoneImport, sendTextImport } = await import("./discordImport");

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
  it("sends only messages without files, under Discord's ids, and leaves the rest for the desktop", async () => {
    const dm = { channelId: "11", name: "kari", userId: "2", avatarUrl: null, messages: 3, files: 1, firstAt: 0, lastAt: 0 };
    const plan = await planPhoneImport(files, dm);
    expect(plan.withFiles).toBe(1);
    const sent: MlsDmContent[] = [];
    const run = sendTextImport({ send: async (_c, _p, content) => void sent.push(content) }, "dm_1", "kari", plan, () => {}, () => false);
    await vi.runAllTimersAsync();
    expect(await run).toBe(2);
    expect(sent).toHaveLength(1);
    const [batch] = sent;
    expect(batch.type).toBe("import");
    if (batch.type === "import") expect(batch.entries.map((e) => e.id)).toEqual(["discord-1", "discord-3"]);
  });
});
