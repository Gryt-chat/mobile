import { describe, expect, it } from "vitest";

import { parseLiveMarkdown } from "./liveMarkdown";

const shown = (text: string) =>
  parseLiveMarkdown(text).map((r) => `${r.type}:${text.slice(r.start, r.start + r.length)}`);

describe("live markdown in the composer", () => {
  it("styles the words and greys the markers", () => {
    expect(shown("a **b** c")).toEqual(["syntax:**", "bold:b", "syntax:**"]);
    expect(shown("*i* and ~~s~~")).toEqual(["syntax:*", "italic:i", "syntax:*", "syntax:~~", "strikethrough:s", "syntax:~~"]);
    expect(shown("***x***")).toEqual(["syntax:***", "bold:x", "italic:x", "syntax:***"]);
  });

  it("leaves code alone inside", () => {
    expect(shown("`**no**`")).toEqual(["syntax:`", "code:**no**", "syntax:`"]);
    expect(shown("```\n**no**\n```")).toEqual(["syntax:```", "pre:**no**", "syntax:```"]);
  });

  it("does lines, links and mentions", () => {
    expect(shown("## Hi")).toEqual(["syntax:## ", "h1:Hi"]);
    expect(shown("> q")).toEqual(["blockquote:> q", "syntax:>"]);
    expect(shown("[docs](https://gryt.chat)")).toEqual(["syntax:[", "link:docs", "syntax:](https://gryt.chat)"]);
    expect(shown("see https://gryt.chat.")).toEqual(["link:https://gryt.chat"]);
    expect(shown("@here hi, not me@here")).toEqual(["mention-here:@here"]);
  });

  it("ignores lone markers", () => {
    expect(shown("2 * 3 * 4 and snake_case_name")).toEqual([]);
  });
});
