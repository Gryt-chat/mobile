import { describe, expect, it } from "vitest";

import { flattenInline, parseInline } from "./markdown";

/** `text` plus the marks that are on, so an expectation reads as a sentence. */
function runs(src: string): string[] {
  return flattenInline(parseInline(src)).map((run) => {
    const on = (["strong", "em", "strike", "code"] as const).filter((m) => run.marks[m]);
    if (run.marks.href) on.push("link" as never);
    return on.length ? `${run.value} [${on.join("+")}]` : run.value;
  });
}

/**
 * The flattening is where a mark gets lost.
 *
 * Nesting `Text` is the obvious way to draw this and it does not work here:
 * the library's `Text` resolves a font family from its own style, and an inner
 * one has only what it was handed — so bold-inside-italic silently comes out
 * as one of the two. These check that every run arrives carrying everything
 * that is true of it.
 */
describe("flattenInline", () => {
  it("carries one mark", () => {
    expect(runs("plain **bold**")).toEqual(["plain ", "bold [strong]"]);
  });

  it("carries both marks through a nesting", () => {
    expect(runs("***both***")).toEqual(["both [strong+em]"]);
    expect(runs("**bold and *also italic***")).toEqual([
      "bold and  [strong]",
      "also italic [strong+em]",
    ]);
  });

  it("keeps the link on every run inside it", () => {
    expect(runs("[**bold** plain](https://a.b)")).toEqual([
      "bold [strong+link]",
      " plain [link]",
    ]);
  });

  it("marks code as code and stops there", () => {
    expect(runs("`**not bold**`")).toEqual(["**not bold** [code]"]);
  });

  /* Italic and code want two different families and only one can win. Code
   * wins, because a monospaced run that stops being monospaced is unreadable
   * in a way a missing slant is not. */
  it("puts code and emphasis on the same run when both apply", () => {
    expect(runs("*a `b` c*")).toEqual(["a  [em]", "b [em+code]", " c [em]"]);
  });

  it("gives back nothing for nothing", () => {
    expect(runs("")).toEqual([]);
  });
});
