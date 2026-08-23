import { describe, expect, it } from "vitest";

import { blocksText, inlineText, parseInline, parseMarkdown, type Inline } from "./markdown";

/** What a node is, without the nesting, so an expectation reads as a sentence. */
function shape(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return `“${node.value}”`;
        case "code":
          return `code(${node.value})`;
        case "link":
          return `link(${node.href}: ${shape(node.children)})`;
        default:
          return `${node.type}(${shape(node.children)})`;
      }
    })
    .join(" ");
}

describe("inline marks", () => {
  it("draws the three people actually use", () => {
    expect(shape(parseInline("**bold** *italic* ~~gone~~"))).toBe(
      'strong(“bold”) “ ” em(“italic”) “ ” strike(“gone”)',
    );
  });

  it("treats __ as bold, the way remark does", () => {
    expect(shape(parseInline("__bold__"))).toBe('strong(“bold”)');
  });

  it("nests three asterisks rather than needing a node for them", () => {
    expect(shape(parseInline("***both***"))).toBe('strong(em(“both”))');
  });

  /* One run of three closing two marks that opened separately. The third
   * character belongs to the inner mark, and reading it as part of the outer
   * closer leaves the italic unclosed and an asterisk stranded. */
  it("closes two marks on one run", () => {
    expect(shape(parseInline("**bold and *also italic***"))).toBe(
      'strong(“bold and ” em(“also italic”))',
    );
  });

  /* The same shape with nothing inside for the extra character to close. It
   * stays a literal asterisk, which is what remark does with it too. */
  it("leaves a spare delimiter alone when it closes nothing", () => {
    expect(shape(parseInline("**a***"))).toBe('strong(“a”) “*”');
  });

  it("marks a run inside a word with asterisks", () => {
    expect(shape(parseInline("un*bloody*likely"))).toBe('“un” em(“bloody”) “likely”');
  });

  /* The one that bites. Underscores are how identifiers are written, and a
   * renderer that italicises the middle of one has broken every message about
   * code that does not use backticks. */
  it("leaves snake_case_names alone", () => {
    expect(shape(parseInline("snake_case_name"))).toBe('“snake_case_name”');
    expect(shape(parseInline("_private_thing"))).toBe('“_private_thing”');
  });

  /* `__init__` really is bold, here and on the desktop. CommonMark only bars
   * `_` from *inside* a word, and that one is a whole word with underscores at
   * both ends — remark bolds it, so this bolds it too. Being cleverer than the
   * desktop would mean one message reading two ways depending on where it was
   * opened, which is worse than a dunder in bold. */
  it("agrees with the desktop about a dunder", () => {
    expect(shape(parseInline("__init__"))).toBe('strong(“init”)');
  });

  /* The other one. Multiplication is written with the emphasis character. */
  it("does not italicise a sum", () => {
    expect(shape(parseInline("2 * 3 * 4"))).toBe('“2 * 3 * 4”');
  });

  it("leaves an unclosed mark as the characters typed", () => {
    expect(shape(parseInline("**not closed"))).toBe('“**not closed”');
    expect(shape(parseInline("a ~~ b"))).toBe('“a ~~ b”');
  });

  it("gives back an escaped mark as itself", () => {
    expect(shape(parseInline("\\*not italic\\*"))).toBe('“*not italic*”');
  });
});

describe("inline code", () => {
  it("wins over everything inside it", () => {
    expect(shape(parseInline("`**not bold**`"))).toBe('code(**not bold**)');
  });

  it("closes on a run of the same length, so a backtick can be written", () => {
    expect(shape(parseInline("`` ` ``"))).toBe("code(`)");
  });

  it("drops exactly one space either side, which is the wrapper", () => {
    expect(shape(parseInline("` a `"))).toBe("code(a)");
    expect(shape(parseInline("`  a  `"))).toBe("code( a )");
  });

  it("is text when it never closes", () => {
    expect(shape(parseInline("`yarn test"))).toBe('“`yarn test”');
  });
});

describe("links", () => {
  it("reads a labelled link", () => {
    expect(shape(parseInline("[the PR](https://github.com/a/b/pull/1)"))).toBe(
      'link(https://github.com/a/b/pull/1: “the PR”)',
    );
  });

  it("parses marks inside the label", () => {
    expect(shape(parseInline("[**bold** link](https://a.b)"))).toBe(
      'link(https://a.b: strong(“bold”) “ link”)',
    );
  });

  it("survives parentheses in the target", () => {
    expect(shape(parseInline("[wiki](https://e.org/Foo_(bar))"))).toBe(
      'link(https://e.org/Foo_(bar): “wiki”)',
    );
  });

  it("is text when there is nothing to link to", () => {
    expect(shape(parseInline("[label]()"))).toBe('“[label]()”');
    expect(shape(parseInline("[just brackets]"))).toBe('“[just brackets]”');
  });

  it("linkifies a bare URL", () => {
    expect(shape(parseInline("see https://gryt.chat now"))).toBe(
      '“see ” link(https://gryt.chat: “https://gryt.chat”) “ now”',
    );
  });

  /* A full stop is legal in a URL and almost never meant at the end of one, so
   * the sentence keeps its punctuation and the link stops before it. */
  it("does not eat the end of the sentence", () => {
    expect(shape(parseInline("go to https://gryt.chat."))).toBe(
      '“go to ” link(https://gryt.chat: “https://gryt.chat”) “.”',
    );
  });

  it("gives a scheme to a bare www", () => {
    expect(shape(parseInline("www.gryt.chat"))).toBe(
      'link(https://www.gryt.chat: “www.gryt.chat”)',
    );
  });

  /* Otherwise the href inside a labelled link gets linkified a second time. */
  it("does not autolink inside a link it already made", () => {
    expect(shape(parseInline("[a](https://b.c)"))).toBe('link(https://b.c: “a”)');
  });
});

describe("blocks", () => {
  it("gives nothing back for nothing", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("\n\n  \n")).toEqual([]);
  });

  it("keeps single newlines, because the desktop runs remark-breaks", () => {
    const [block] = parseMarkdown("one\ntwo");
    expect(block).toEqual({ type: "paragraph", children: [{ type: "text", value: "one\ntwo" }] });
  });

  it("splits paragraphs on a blank line", () => {
    expect(parseMarkdown("one\n\ntwo")).toHaveLength(2);
  });

  it("reads a fenced code block with its language", () => {
    expect(parseMarkdown("```ts\nconst a = 1;\n```")).toEqual([
      { type: "code", lang: "ts", value: "const a = 1;" },
    ]);
  });

  /* Somebody who opens a fence and hits send meant the rest to be code. */
  it("runs an unclosed fence to the end", () => {
    expect(parseMarkdown("```\na\nb")).toEqual([{ type: "code", lang: null, value: "a\nb" }]);
  });

  it("does not parse marks inside a fence", () => {
    expect(parseMarkdown("```\n**not bold**\n```")).toEqual([
      { type: "code", lang: null, value: "**not bold**" },
    ]);
  });

  it("reads headings up to three", () => {
    expect(parseMarkdown("# one").map((b) => b.type)).toEqual(["heading"]);
    expect(parseMarkdown("#### four")[0].type).toBe("paragraph");
  });

  it("does not make a heading out of a hashtag", () => {
    expect(parseMarkdown("#nothashtag")[0].type).toBe("paragraph");
  });

  it("collects consecutive quote lines into one quote", () => {
    const [block] = parseMarkdown("> one\n> two");
    expect(block).toEqual({
      type: "quote",
      children: [{ type: "paragraph", children: [{ type: "text", value: "one\ntwo" }] }],
    });
  });

  it("lets a quote hold a code block, which is why it holds blocks", () => {
    const [block] = parseMarkdown("> ```\n> a\n> ```");
    expect(block).toEqual({
      type: "quote",
      children: [{ type: "code", lang: null, value: "a" }],
    });
  });

  it("reads both kinds of list", () => {
    expect(parseMarkdown("- a\n- b")).toEqual([
      {
        type: "list",
        ordered: false,
        start: 1,
        items: [[{ type: "text", value: "a" }], [{ type: "text", value: "b" }]],
      },
    ]);
    const [ordered] = parseMarkdown("3. a\n4. b");
    expect(ordered).toMatchObject({ type: "list", ordered: true, start: 3 });
  });

  /* The markers say two lists, and running them together would renumber one. */
  it("starts a new list when the marker changes", () => {
    expect(parseMarkdown("- a\n1. b").map((b) => b.type)).toEqual(["list", "list"]);
  });

  it("ends a paragraph where a block of its own starts", () => {
    expect(parseMarkdown("words\n- a").map((b) => b.type)).toEqual(["paragraph", "list"]);
    expect(parseMarkdown("words\n> a").map((b) => b.type)).toEqual(["paragraph", "quote"]);
  });

  /* A message that is only a mark is somebody typing about markdown, and it
   * should read as what they typed. */
  it("leaves a lone asterisk alone", () => {
    expect(parseMarkdown("*")).toEqual([
      { type: "paragraph", children: [{ type: "text", value: "*" }] },
    ]);
  });
});

describe("text extraction", () => {
  it("gives the words without the marks", () => {
    expect(inlineText(parseInline("**bold** and `code`"))).toBe("bold and code");
  });

  it("walks a whole message, for the accessibility label", () => {
    expect(blocksText(parseMarkdown("# Title\n\n- one\n- two\n\n> quoted"))).toBe(
      "Title\none\ntwo\nquoted",
    );
  });
});
