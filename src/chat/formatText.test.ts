import { describe, expect, it } from "vitest";

import { applyFormat, isActive, type Format } from "./formatText";

const run = (marked: string, format: Format) => {
  const start = marked.indexOf("«");
  const end = marked.indexOf("»") - 1;
  const text = marked.replace("«", "").replace("»", "");
  const out = applyFormat(text, start, end, format);
  return out.text.slice(0, out.start) + "«" + out.text.slice(out.start, out.end) + "»" + out.text.slice(out.end);
};

describe("format buttons on plain text", () => {
  it("wraps and unwraps", () => {
    expect(run("say «hi» now", "bold")).toBe("say **«hi»** now");
    expect(run("say **«hi»** now", "bold")).toBe("say «hi» now");
    expect(run("say «hi»", "strike")).toBe("say ~~«hi»~~");
    expect(run("`«x»`", "code")).toBe("«x»");
  });

  it("tells italic from bold", () => {
    expect(run("**«hi»**", "italic")).toBe("***«hi»***");
    expect(run("***«hi»***", "italic")).toBe("**«hi»**");
    expect(run("***«hi»***", "bold")).toBe("*«hi»*");
    expect(isActive("**hi**", 2, 4, "italic")).toBe(false);
  });

  it("links and unlinks", () => {
    expect(run("see «docs»", "link")).toBe("see [docs](«»)");
    expect(run("see [«docs»](https://gryt.chat)", "link")).toBe("see «docs»");
  });

  it("prefixes every line, and swaps heading levels", () => {
    expect(run("«a\nb»", "list")).toBe("«- a\n- b»");
    expect(run("«- a\n- b»", "list")).toBe("«a\nb»");
    expect(run("x\nti«t»le", "h2")).toBe("x\n«## title»");
    expect(run("«# title»", "h3")).toBe("«### title»");
    expect(run("«a\n\nb»", "quote")).toBe("«> a\n\n> b»");
  });
});
