import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchLinkPreview, PREVIEW_REQUEST_TIMEOUT_MS } from "./linkPreview";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchLinkPreview", () => {
  it("gives up on a server that never answers (GRYT-2027)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const pending = fetchLinkPreview("example.test", "token", "https://gryt.chat/sponsors");
    const settled = expect(pending).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(PREVIEW_REQUEST_TIMEOUT_MS);
    await settled;
  });
});
