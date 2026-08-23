import { describe, expect, it } from "vitest";

import { MAX_ATTACHMENTS } from "../chat/staging";
import { droppedCount, normalizeShare } from "./incoming";

describe("normalizeShare", () => {
  it("takes shared text", () => {
    expect(normalizeShare({ text: "look at this" })).toEqual({
      text: "look at this",
      files: [],
    });
  });

  it("trims, because a share sheet adds whitespace nobody typed", () => {
    expect(normalizeShare({ text: "  https://gryt.chat  " })?.text).toBe("https://gryt.chat");
  });

  it("takes a file, guessing the name and type the sender did not send", () => {
    expect(normalizeShare({ files: [{ uri: "content://media/external/images/media/42" }] })).toEqual(
      {
        text: null,
        files: [
          {
            uri: "content://media/external/images/media/42",
            mime: "image/jpeg",
            name: "upload.jpeg",
            width: undefined,
            height: undefined,
          },
        ],
      },
    );
  });

  it("keeps what the sender did say", () => {
    const share = normalizeShare({
      files: [{ uri: "file:///tmp/a.png", mime: "image/png", name: "a.png" }],
    });
    expect(share?.files[0]).toMatchObject({ mime: "image/png", name: "a.png" });
  });

  it("takes text and files together", () => {
    const share = normalizeShare({ text: "here", files: [{ uri: "file:///tmp/a.png" }] });
    expect(share?.text).toBe("here");
    expect(share?.files).toHaveLength(1);
  });

  /* Both platforms hand over an empty share as a matter of course — Android
     reads the launch Intent whether or not it was a share. */
  it("is null when there is nothing to send", () => {
    expect(normalizeShare(null)).toBeNull();
    expect(normalizeShare(undefined)).toBeNull();
    expect(normalizeShare({})).toBeNull();
    expect(normalizeShare({ text: "   ", files: [] })).toBeNull();
  });

  it("ignores files with no uri rather than sending an empty one", () => {
    expect(normalizeShare({ files: [{ uri: "" }, { uri: "file:///tmp/a.png" }] })?.files).toHaveLength(
      1,
    );
  });

  it("caps at what the composer allows", () => {
    const files = Array.from({ length: MAX_ATTACHMENTS + 6 }, (_, i) => ({
      uri: `file:///tmp/${i}.png`,
    }));
    expect(normalizeShare({ files })?.files).toHaveLength(MAX_ATTACHMENTS);
  });
});

describe("droppedCount", () => {
  it("is zero when everything fits", () => {
    expect(droppedCount({ files: [{ uri: "file:///tmp/a.png" }] })).toBe(0);
    expect(droppedCount(null)).toBe(0);
  });

  it("counts what the cap left behind", () => {
    const files = Array.from({ length: MAX_ATTACHMENTS + 3 }, (_, i) => ({
      uri: `file:///tmp/${i}.png`,
    }));
    expect(droppedCount({ files })).toBe(3);
  });

  it("does not count files that were never sendable", () => {
    const files = [
      ...Array.from({ length: MAX_ATTACHMENTS }, (_, i) => ({ uri: `file:///tmp/${i}.png` })),
      { uri: "" },
    ];
    expect(droppedCount({ files })).toBe(0);
  });
});
