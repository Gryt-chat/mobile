import { describe, expect, it } from "vitest";

import vectors from "./mention-vectors.json";
import { massMentionHits, mentionTarget, plainMentionTokens, type MentionViewer } from "./mentionTokens";

/* The same vectors the desktop and the server check, so the three agree (GRYT-1455). */
describe("mention links", () => {
  for (const v of vectors.targets) {
    it(`reads ${v.href || "(empty)"}`, () => expect(mentionTarget(v.href)).toEqual(v.target));
  }
});

describe("whether a mention hits the reader", () => {
  for (const v of vectors.hits) {
    it(`${v.text} ${JSON.stringify(v.viewer)}`, () =>
      expect(massMentionHits(v.text, v.viewer as MentionViewer)).toBe(v.hit));
  }
});

describe("mentions as words", () => {
  for (const v of vectors.plain) {
    const channels = v.channels as Record<string, string>;
    it(v.text, () =>
      expect(plainMentionTokens(v.text, (id, host) => channels[host ? `${host}/${id}` : id] ?? null)).toBe(v.plain));
  }
});
