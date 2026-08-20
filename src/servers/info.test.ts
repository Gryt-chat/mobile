import { afterEach, describe, expect, it, vi } from "vitest";

import { forgetScheme, getRememberedScheme } from "./address";
import { fetchServerInfo } from "./info";

/* What matters here is the scheme dance, which is the part with a real cost
 * when it is wrong: a server dialled the wrong way looks unreachable, and the
 * WebSocket that follows has no redirect to fall back on. */

const INFO = {
  name: "Pivert CLI Server",
  description: "A Gryt server",
  members: "0",
  joinPolicy: "invite" as const,
};

function respond(url: string, body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  forgetScheme("example.test");
  vi.unstubAllGlobals();
});

describe("fetchServerInfo", () => {
  it("tries plain first, since Gryt's server has no TLS of its own", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      respond(url, INFO),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchServerInfo("example.test");

    expect(fetchMock.mock.calls[0][0]).toBe("http://example.test/info");
    expect(result).toEqual({ kind: "info", info: INFO });
  });

  it("retries the other scheme when nothing answers at all", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockImplementationOnce(async (url: string) => respond(url, INFO));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchServerInfo("example.test");

    expect(fetchMock.mock.calls[1][0]).toBe("https://example.test/info");
    expect(result.kind).toBe("info");
  });

  it("remembers the scheme that actually served the reply, not the one asked for", async () => {
    // A proxy on port 80 answers a plain request with a redirect to https and
    // fetch follows it. That succeeds while proving the opposite of the guess.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond("https://example.test/info", INFO)),
    );

    await fetchServerInfo("example.test");

    expect(getRememberedScheme("example.test")).toBe("https");
  });

  it("reads 404 as private rather than as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => respond(url, { error: "not_found" }, 404)),
    );

    expect(await fetchServerInfo("example.test")).toEqual({ kind: "private" });
  });

  it("reports another failing status as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => respond(url, {}, 500)),
    );

    const result = await fetchServerInfo("example.test");
    expect(result).toEqual({ kind: "error", message: "Server responded with 500" });
  });

  it("does not retry a server that answered with an error", async () => {
    const fetchMock = vi.fn(async (url: string) => respond(url, {}, 500));
    vi.stubGlobal("fetch", fetchMock);

    await fetchServerInfo("example.test");

    // Reached and refused is an answer. Dialling again differently is noise.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("says so when there is no address at all", async () => {
    expect(await fetchServerInfo("")).toEqual({ kind: "error", message: "No address" });
  });

  it("reports a superseded lookup separately from a timeout", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const err = new Error("Aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      ),
    );

    const pending = fetchServerInfo("example.test", controller.signal);
    controller.abort();

    expect(await pending).toEqual({ kind: "superseded" });
  });
});
