import { afterEach, describe, expect, it, vi } from "vitest";

import { GROUP_PICTURE_NEEDS_UPDATE, uploadGroupPicture } from "./groupPicture";

/** The avatar route made a group's picture your own avatar too (GRYT-1182). */

function answer(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      if (typeof body === "string") throw new SyntaxError("not json");
      return body;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadGroupPicture", () => {
  it("uses the group picture route and hands back its file id", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => answer(201, { fileId: "f-1", processing: false }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadGroupPicture("http://h", "tok", "file:///g.jpg", "g.jpg")).resolves.toBe("f-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://h/api/uploads/group-icon");
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ Authorization: "Bearer tok" });
  });

  it("passes on the server's reason for refusing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer(413, { message: "Group picture too large. Max 5.0MB." })));
    await expect(uploadGroupPicture("http://h", "tok", "file:///g.jpg", "g.jpg")).rejects.toThrow(/too large/);
  });

  it("says the server needs an update, and never tries the avatar route", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/api/uploads/avatar")
        ? answer(201, { avatarFileId: "would-be-your-avatar" })
        : answer(404, "<pre>Cannot POST /api/uploads/group-icon</pre>"),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadGroupPicture("http://h", "tok", "file:///g.jpg", "g.jpg")).rejects.toThrow(GROUP_PICTURE_NEEDS_UPDATE);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["http://h/api/uploads/group-icon"]);
  });
});
