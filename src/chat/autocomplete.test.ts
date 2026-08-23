import { describe, expect, it } from "vitest";

import { complete, justClosedShortcode, queryAt, rank } from "./autocomplete";

/** `text` with `|` marking the caret, which is how these read as sentences. */
function at(withCaret: string) {
  const caret = withCaret.indexOf("|");
  return queryAt(withCaret.replace("|", ""), caret);
}

describe("queryAt", () => {
  it("finds a mention being typed", () => {
    expect(at("hey @siv|")).toMatchObject({ trigger: "@", term: "siv", start: 4 });
  });

  it("finds an emoji being typed", () => {
    expect(at("nice :ta|")).toMatchObject({ trigger: ":", term: "ta", start: 5 });
  });

  it("offers everything the moment the trigger is typed", () => {
    expect(at("@|")).toMatchObject({ trigger: "@", term: "" });
  });

  it("is nothing when there is no trigger behind the caret", () => {
    expect(at("plain words|")).toBeNull();
    expect(at("|")).toBeNull();
  });

  /* The two that would put a list up while somebody writes an ordinary
   * sentence. Both are the same rule: a trigger has to start a word. */
  it("is not an email address or a time", () => {
    expect(at("mail@ada|")).toBeNull();
    expect(at("at 9:3|")).toBeNull();
  });

  it("opens after a bracket, which is still a word boundary", () => {
    expect(at("(@siv|")).toMatchObject({ trigger: "@", term: "siv" });
  });

  /* A space ends the search rather than being skipped, so a `@` three
   * sentences ago does not keep offering completions. */
  it("stops at a space", () => {
    expect(at("@sivert said |")).toBeNull();
    expect(at("@sivert |")).toBeNull();
  });

  /* Once the closing colon is there the shortcode is finished, and the list
   * would be sitting over a message that is done. */
  it("closes once the emoji is complete", () => {
    expect(at(":tada:|")).toBeNull();
    expect(at(":tada|")).toMatchObject({ term: "tada" });
  });

  it("only looks behind the caret", () => {
    expect(at("a| @sivert")).toBeNull();
  });

  /* The nearest trigger wins, and a nearest one that is not at a word
   * boundary ends the search rather than falling back to an earlier one. So
   * `@a:b` offers nothing: the colon is mid-word, and the `@` before it is no
   * longer what the caret is inside. Scanning past it would mean a stray colon
   * in a nickname reopening a mention list several characters back. */
  it("stops at the nearest trigger, even when it is not one", () => {
    expect(at("@a:b|")).toBeNull();
    expect(at("@a b|")).toBeNull();
  });
});

describe("rank", () => {
  const names = ["tada", "star", "star_struck", "stars"];

  it("gives everything back for an empty term", () => {
    expect(rank(names, "")).toEqual(names);
  });

  it("puts prefix matches first", () => {
    expect(rank(["star_struck", "tada", "star"], "sta")).toEqual(["star_struck", "star"]);
  });

  /* `:ta` should offer `tada` before `star`, which is the whole point of the
   * two groups. */
  it("prefers what starts with the term over what merely contains it", () => {
    expect(rank(["star", "tada"], "ta")).toEqual(["tada", "star"]);
  });

  it("ignores case", () => {
    expect(rank(["Sivert", "Ada"], "siv")).toEqual(["Sivert"]);
  });

  it("keeps the given order inside a group", () => {
    expect(rank(["stars", "star", "star_struck"], "star")).toEqual([
      "stars",
      "star",
      "star_struck",
    ]);
  });

  it("caps the list", () => {
    expect(rank(["a1", "a2", "a3", "a4"], "a", 2)).toEqual(["a1", "a2"]);
  });
});

describe("complete", () => {
  it("replaces the query and leaves the caret after it", () => {
    const query = queryAt("hey @siv", 8)!;
    expect(complete("hey @siv", query, "Sivert")).toEqual({
      text: "hey @Sivert ",
      caret: 12,
    });
  });

  it("closes an emoji and adds the space", () => {
    const query = queryAt("nice :ta", 8)!;
    expect(complete("nice :ta", query, "tada")).toEqual({ text: "nice :tada: ", caret: 12 });
  });

  it("keeps whatever came after the caret", () => {
    const query = queryAt("@siv and more", 4)!;
    expect(complete("@siv and more", query, "Sivert").text).toBe("@Sivert  and more");
  });

  it("inserts a two-word name the typing could not have reached", () => {
    const query = queryAt("@ada", 4)!;
    expect(complete("@ada", query, "Ada Lovelace").text).toBe("@Ada Lovelace ");
  });
});

describe("complete, with a rendered insert", () => {
  /* The desktop's editor puts the character in, not the name, so the composer
   * shows what the message will look like. */
  it("puts a standard emoji in as its character", () => {
    const query = queryAt("nice :ta", 8)!;
    expect(complete("nice :ta", query, "tada", "🎉")).toEqual({
      text: "nice 🎉 ",
      caret: 8,
    });
  });

  /* A custom emoji is a picture on the server and there is nothing to type in
   * its place, so the shortcode stays and the message renders it. */
  it("leaves a custom one as its shortcode", () => {
    const query = queryAt(":part", 5)!;
    expect(complete(":part", query, "partyblob").text).toBe(":partyblob: ");
  });
});

describe("justClosedShortcode", () => {
  it("sees the colon that finished one", () => {
    expect(justClosedShortcode("hey :tada", "hey :tada:")).toEqual({
      name: "tada",
      start: 4,
      end: 10,
    });
  });

  it("sees one closed in the middle of a sentence", () => {
    expect(justClosedShortcode("a :tada b", "a :tada: b")).toMatchObject({
      name: "tada",
      start: 2,
      end: 8,
    });
  });

  /* Only the edit that closed it. Moving the caret around an existing one, or
   * any other change, is not somebody finishing a shortcode. */
  it("is nothing when the change was not a single colon", () => {
    expect(justClosedShortcode("hey :tada:", "hey :tada:")).toBeNull();
    expect(justClosedShortcode("hey :tada", "hey :tadaX")).toBeNull();
    expect(justClosedShortcode("hey :tada", "hey :tada: ")).toBeNull();
    expect(justClosedShortcode("hey :tada:", "hey :tada")).toBeNull();
  });

  it("is nothing when there is no name to close", () => {
    expect(justClosedShortcode("hey ", "hey :")).toBeNull();
    expect(justClosedShortcode("hey :", "hey ::")).toBeNull();
  });

  /* The rule that stops a time becoming an emoji, same as the one in queryAt. */
  it("is not a time being typed", () => {
    expect(justClosedShortcode("at 9:30", "at 9:30:")).toBeNull();
  });

  it("takes the opening colon nearest the closing one", () => {
    expect(justClosedShortcode("a :b :c", "a :b :c:")).toMatchObject({ name: "c", start: 5 });
  });
});
