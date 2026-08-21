import { describe, expect, it } from "vitest";

import { attachmentUrl, imageBox, isImage, readableSize } from "./files";

const image = { file_id: "f1", mime: "image/png", width: 800, height: 600 };

describe("attachmentUrl", () => {
  it("uses the same route the desktop does", () => {
    expect(attachmentUrl("chat.example.com", "abc")).toBe(
      "http://chat.example.com/api/uploads/files/abc",
    );
  });

  it("asks for the thumbnail when told to", () => {
    expect(attachmentUrl("chat.example.com", "abc", true)).toBe(
      "http://chat.example.com/api/uploads/files/abc?thumb=1",
    );
  });

  /**
   * Mobile's `schemeFor` defaults to **http** and only returns https for a host
   * it has already been served over — it probes and remembers, where the
   * desktop decides from the hostname.
   *
   * So this is deliberately not the client's URL for the same host, and the
   * assertion says so rather than quietly matching whatever came out. Getting
   * this wrong is how an attachment 404s on a LAN server that has never spoken
   * TLS in its life.
   */
  it("goes through the app's own scheme rule, not the hostname", () => {
    expect(attachmentUrl("192.168.1.4:5002", "abc")).toBe(
      "http://192.168.1.4:5002/api/uploads/files/abc",
    );
  });
});

describe("isImage", () => {
  it("decides on the mime the server sniffed", () => {
    expect(isImage(image)).toBe(true);
    expect(isImage({ file_id: "f", mime: "application/pdf" })).toBe(false);
  });

  it("treats a missing mime as not an image", () => {
    // A broken picture is worse than an honest card.
    expect(isImage({ file_id: "f" })).toBe(false);
  });

  it("is not fooled by a name", () => {
    expect(isImage({ file_id: "f", mime: "application/pdf", original_name: "a.png" })).toBe(false);
  });
});

describe("readableSize", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [2048, "2.0 KB"],
    [1024 * 1024 * 1.5, "1.5 MB"],
  ])("renders %s bytes as %s", (bytes, expected) => {
    expect(readableSize(bytes)).toBe(expected);
  });

  it("says nothing when the server did not", () => {
    expect(readableSize(undefined)).toBeNull();
    expect(readableSize(-1)).toBeNull();
  });
});

describe("imageBox", () => {
  it("fits inside the width it is given", () => {
    const box = imageBox(image, 300);
    expect(box.width).toBeLessThanOrEqual(300);
    expect(box.height / box.width).toBeCloseTo(600 / 800, 1);
  });

  it("never blows past the height cap, however tall the picture", () => {
    const box = imageBox({ file_id: "f", mime: "image/png", width: 400, height: 4000 }, 300, 320);
    expect(box.height).toBeLessThanOrEqual(320);
  });

  it("does not upscale a small image to fill the row", () => {
    const box = imageBox({ file_id: "f", mime: "image/png", width: 60, height: 60 }, 300);
    expect(box.width).toBe(60);
  });

  it("reserves a sensible box when the server sent no dimensions", () => {
    // Older uploads have none. Collapsing to zero and jumping when the image
    // lands is the thing to avoid on a scrolling list.
    const box = imageBox({ file_id: "f", mime: "image/png" }, 300);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });
});
