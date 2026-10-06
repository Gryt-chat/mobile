import { describe, expect, it } from "vitest";
import { cardProfileOf, DEFAULT_CARD_STYLE, encodeGrytCard, normalizeCardStyle } from "@gryt/ui/card-core";

import { cardPayload, hexFrom, patternGroups, sameCard, styleFromLink } from "./cardDraft";

describe("Edit my card's pure half (GRYT-1630)", () => {
  it("sends a card nobody styled as plain, like desktop", () => {
    expect(cardPayload(cardProfileOf({})).cardStyle).toEqual({ plain: true });
  });

  it("notices a change worth saving and ignores one that isn't", () => {
    const a = cardProfileOf({ bio: "hi" });
    expect(sameCard(a, cardProfileOf({ bio: "hi" }))).toBe(true);
    expect(sameCard(a, cardProfileOf({ bio: "hello" }))).toBe(false);
  });

  it("reads a card link whole or as just its query", () => {
    const style = normalizeCardStyle({ ...DEFAULT_CARD_STYLE, fill: "solid", c1: "#d4a017", pattern: "dots" });
    const code = encodeGrytCard(style);
    expect(styleFromLink(`https://ui.gryt.chat/card?${code}`)?.pattern).toBe("dots");
    expect(styleFromLink(code)?.c1).toBe("#d4a017");
    expect(styleFromLink("not a card")).toBeNull();
  });

  it("takes hex with or without the hash", () => {
    expect(hexFrom("D4A017")).toBe("#d4a017");
    expect(hexFrom("#d4a017")).toBe("#d4a017");
    expect(hexFrom("#d4a01")).toBeNull();
  });

  it("puts every pattern under a heading", () => {
    const groups = patternGroups();
    expect(groups[0].group).toBe("Classic");
    expect(groups.flatMap((g) => g.patterns).some((p) => p.id === "waves-1")).toBe(true);
  });
});
