import { describe, expect, it, vi } from "vitest";

import { publishPersonKey } from "./publishPersonKey";

function socketAnswering(...replies: unknown[]) {
  const sent: unknown[] = [];
  return {
    sent,
    emit: (_event: string, payload: unknown, ack: (r: unknown) => void) => {
      sent.push(payload);
      ack(replies.shift());
    },
  };
}

describe("publishPersonKey", () => {
  it("tries once more when the DM key hadn't landed yet", async () => {
    const socket = socketAnswering({ ok: false, error: "no_dm_key" }, { ok: true, changed: true });
    const wait = vi.fn(async () => undefined);
    expect(await publishPersonKey(socket, "t", "binding", wait)).toBe(true);
    expect(socket.sent).toEqual([
      { accessToken: "t", binding: "binding" },
      { accessToken: "t", binding: "binding" },
    ]);
    expect(wait).toHaveBeenCalledOnce();
  });

  it("gives up after the second no_dm_key, and doesn't retry anything else", async () => {
    const twice = socketAnswering({ ok: false, error: "no_dm_key" }, { ok: false, error: "no_dm_key" });
    expect(await publishPersonKey(twice, "t", "b", async () => undefined)).toBe(false);
    expect(twice.sent).toHaveLength(2);

    const wrong = socketAnswering({ ok: false, error: "wrong_identity" });
    expect(await publishPersonKey(wrong, "t", "b", async () => undefined)).toBe(false);
    expect(wrong.sent).toHaveLength(1);
  });
});
