import { describe, expect, it } from "vitest";

import type { Picked } from "../chat/staging";
import { summarise } from "./summary";

const file = (mime: string): Picked => ({ uri: "file:///tmp/x", mime, name: "x" });

describe("summarise", () => {
  it("is the text when only text was shared", () => {
    expect(summarise({ text: "https://gryt.chat", files: [] })).toBe("https://gryt.chat");
  });

  it("counts one photo without pluralising it", () => {
    expect(summarise({ text: null, files: [file("image/jpeg")] })).toBe("1 photo");
  });

  it("counts several", () => {
    expect(summarise({ text: null, files: [file("image/png"), file("image/jpeg")] })).toBe(
      "2 photos",
    );
  });

  it("names videos and audio as themselves", () => {
    expect(summarise({ text: null, files: [file("video/mp4")] })).toBe("1 video");
    expect(summarise({ text: null, files: [file("audio/mpeg")] })).toBe("1 audio file");
  });

  /* "2 photos and a PDF" is not worth the code, and "2 files" is not wrong. */
  it("falls back to files for a mixed set", () => {
    expect(summarise({ text: null, files: [file("image/png"), file("application/pdf")] })).toBe(
      "2 files",
    );
  });

  it("keeps a caption sent alongside a file", () => {
    expect(summarise({ text: "look", files: [file("image/png")] })).toBe("1 photo — look");
  });

  it("is empty when there is genuinely nothing, rather than saying so", () => {
    expect(summarise({ text: null, files: [] })).toBe("");
  });
});
