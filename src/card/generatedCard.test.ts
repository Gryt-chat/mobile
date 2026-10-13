import { describe, expect, it } from "vitest";

import { cardProfileFor, generatedCardStyle } from "./generatedCard";

describe("generated cards", () => {
  it("gives the same style for the same name, however it is cased or padded", () => {
    expect(generatedCardStyle(" Thunder ")).toEqual(generatedCardStyle("thunder"));
  });

  it("only stands in when the server has no style", () => {
    expect(cardProfileFor({}, "Thunder").cardStyle).toEqual(generatedCardStyle("Thunder"));
    expect(cardProfileFor({ cardStyle: { plain: true } }, "Thunder").cardStyle).not.toEqual(generatedCardStyle("Thunder"));
  });
});
