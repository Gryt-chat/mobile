import {
  asIdentityScope,
  deriveDmKeyPair,
  openAttachment,
  openMessage,
  sealAttachment,
  sealMessage,
} from "@gryt/crypto";
import { describe, expect, it } from "vitest";

import { attachmentSource, sealedAttachmentMeta } from "./files";

/**
 * A file that goes up encrypted and comes back drawable (GRYT-761).
 *
 * The round trip runs for real, through the package and the actual curve
 * library, because both failures are silent. A file that goes up in the clear
 * from a conversation the composer calls encrypted looks exactly like one that
 * did not. And one that comes back as an unnamed octet-stream — because the
 * metadata from inside the envelope was never applied — draws as a download
 * card instead of a picture, which reads as the sender's mistake.
 *
 * `expo-file-system` is not exercised here. Writing bytes to a cache file needs
 * a device, and what it would prove is that expo works. What is checked is what
 * happens to the metadata and which uri the list ends up pointing at.
 */

const SCOPE = asIdentityScope("srv:attachments");
const CONVERSATION = "dm_g0123456789abcdef0123456789abcdef";
const seed = (n: number) => Uint8Array.from({ length: 32 }, (_, i) => (i * n + n) % 251);

const alice = { id: "user_alice", keys: deriveDmKeyPair(seed(3), SCOPE) };
const bob = { id: "user_bob", keys: deriveDmKeyPair(seed(7), SCOPE) };
const pair = [alice, bob].map((p) => ({ memberId: p.id, publicKey: p.keys.publicKey }));

/** Bytes above 0x7f, which is where a lazy encoding breaks. */
const FILE = Uint8Array.from({ length: 3000 }, (_, i) => (i * 37) % 256);

describe("the whole way round", () => {
  it("goes up encrypted and comes back as the picture it was", async () => {
    const { ciphertext, meta } = sealAttachment({
      bytes: FILE,
      conversationId: CONVERSATION,
      name: "holiday.png",
      mime: "image/png",
      width: 800,
      height: 600,
    });

    const sealed = await sealMessage({
      plaintext: "have a look",
      conversationId: CONVERSATION,
      senderKeys: alice.keys,
      recipients: pair,
      attachments: { server_file_id: meta },
    });

    // Nothing about the file is legible in what goes on the wire.
    const wire = JSON.stringify(sealed);
    expect(wire).not.toContain(meta.key);
    expect(wire).not.toContain("holiday.png");

    const opened = await openMessage({
      sealed,
      conversationId: CONVERSATION,
      memberId: bob.id,
      recipientKeys: bob.keys,
    });

    const key = opened!.attachments.server_file_id;
    expect(key).toBeTruthy();

    const plain = openAttachment({ ciphertext, conversationId: CONVERSATION, meta: key });
    expect(Array.from(plain)).toEqual(Array.from(FILE));

    // And the row draws it as a picture rather than as the octet-stream the
    // server thinks it is.
    const drawn = sealedAttachmentMeta("server_file_id", key, "file:///cache/x");
    expect(drawn.mime).toBe("image/png");
    expect(drawn.original_name).toBe("holiday.png");
    expect(drawn.width).toBe(800);
    expect(drawn.height).toBe(600);
    expect(drawn.size).toBe(FILE.length);
  });

  it("says there is no thumbnail, because there cannot be one", () => {
    // A thumbnail is made by decoding the picture and the server was handed
    // noise. Claiming one sends the list to `?thumb=1`, which 404s.
    const { meta } = sealAttachment({ bytes: FILE, conversationId: CONVERSATION });

    expect(sealedAttachmentMeta("f", meta, "file:///cache/x").has_thumbnail).toBe(false);
  });

  it("still draws when the picker said nothing about the file", () => {
    // `name` and `mime` are optional in the envelope. An undefined mime
    // reaching the list makes `isImage` false and the row draws a card, which
    // is honest — but an undefined *uri* would draw nothing at all.
    const { meta } = sealAttachment({ bytes: FILE, conversationId: CONVERSATION });
    const drawn = sealedAttachmentMeta("f", meta, "file:///cache/x");

    expect(drawn.mime).toBe("application/octet-stream");
    expect(drawn.original_name).toBeUndefined();
    expect(drawn.local_uri).toBe("file:///cache/x");
  });
});

describe("attachmentSource", () => {
  it("draws the decrypted copy when there is one", () => {
    // The server has ciphertext under octet-stream. Pointing an Image at the
    // ordinary url is a broken picture.
    expect(
      attachmentSource("gryt.test", { file_id: "abc", local_uri: "file:///cache/abc" }),
    ).toBe("file:///cache/abc");
  });

  it("ignores thumb for a sealed attachment", () => {
    // There is no thumbnail to ask for and `?thumb=1` would 404.
    expect(
      attachmentSource("gryt.test", { file_id: "abc", local_uri: "file:///cache/abc" }, true),
    ).toBe("file:///cache/abc");
  });

  it("falls back to the server for everything sent before this shipped", () => {
    expect(attachmentSource("gryt.test", { file_id: "abc" })).toContain("/api/uploads/files/abc");
    expect(attachmentSource("gryt.test", { file_id: "abc" }, true)).toContain("thumb=1");
  });
});
