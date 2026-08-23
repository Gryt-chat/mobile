import { describe, expect, it } from "vitest";

import { mimeOf, nameOf, pickedFrom, uploadProblem } from "./staging";

describe("mimeOf", () => {
  it("takes what the platform sniffed", () => {
    expect(mimeOf({ uri: "file:///a.jpg", mimeType: "image/png" })).toBe("image/png");
  });

  /* Android routinely returns neither, which is the case this file exists for. */
  it("falls back to the extension", () => {
    expect(mimeOf({ uri: "file:///a.png" })).toBe("image/png");
    expect(mimeOf({ uri: "file:///a.MOV" })).toBe("video/quicktime");
    expect(mimeOf({ uri: "file:///a.heic" })).toBe("image/heic");
  });

  it("survives a query string on the uri", () => {
    expect(mimeOf({ uri: "file:///a.gif?v=2" })).toBe("image/gif");
  });

  /* A content:// uri has no extension and no name. Guessing an image is right
   * because that is what the picker was opened for. */
  it("guesses from the asset kind when the uri says nothing", () => {
    expect(mimeOf({ uri: "content://media/external/images/media/1000034" })).toBe("image/jpeg");
    expect(mimeOf({ uri: "content://media/external/video/media/12", type: "video" })).toBe(
      "video/mp4",
    );
  });
});

describe("nameOf", () => {
  it("keeps the name the picker gave", () => {
    expect(nameOf({ uri: "file:///x", fileName: "holiday.jpg" }, "image/jpeg")).toBe("holiday.jpg");
  });

  it("takes the last path segment when it looks like a file", () => {
    expect(nameOf({ uri: "file:///tmp/IMG_0042.HEIC" }, "image/heic")).toBe("IMG_0042.HEIC");
  });

  /* The one that matters: without this the server is asked to store a file
   * called "undefined" and derives its extension from that. */
  it("makes one up from the type when there is nothing to use", () => {
    expect(nameOf({ uri: "content://media/external/images/media/1000034" }, "image/png")).toBe(
      "upload.png",
    );
    expect(nameOf({ uri: "content://x/1" }, "video/quicktime")).toBe("upload.mov");
  });
});

describe("pickedFrom", () => {
  it("carries the measurements through, so a row can size before it loads", () => {
    expect(pickedFrom({ uri: "file:///a.jpg", width: 400, height: 300 })).toEqual({
      uri: "file:///a.jpg",
      mime: "image/jpeg",
      name: "a.jpg",
      width: 400,
      height: 300,
    });
  });
});

describe("uploadProblem", () => {
  /* "Upload failed (413)" tells somebody nothing they can act on. */
  it("says what a size refusal actually means", () => {
    expect(uploadProblem(413)).toBe("That file is too big for this server.");
  });

  it("says what a permission refusal means", () => {
    expect(uploadProblem(403)).toBe("You are not allowed to attach files here.");
  });

  it("prefers what the server said to a guess", () => {
    expect(uploadProblem(400, "Only image files are allowed")).toBe("Only image files are allowed");
  });

  it("has something to say when the server said nothing", () => {
    expect(uploadProblem(500)).toBe("The server refused it (500).");
  });
});
