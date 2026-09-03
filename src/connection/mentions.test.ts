import { describe, expect, it } from "vitest";

import {
  addMention,
  applyCounts,
  clearMentions,
  totalFor,
  type MentionsByHost,
} from "./mentions";

const HOST = "community.gryt.chat";
const OTHER = "gryt.example";

describe("mention counts", () => {
  it("takes what the server says", () => {
    const all = applyCounts({}, HOST, { general: 2, help: 1 });
    expect(all[HOST]).toEqual({ general: 2, help: 1 });
  });

  it("replaces rather than merges", () => {
    // The case this exists for: read on a desktop while the phone was asleep.
    // Merging would leave a badge on #help that nothing here can clear.
    let all = applyCounts({}, HOST, { general: 2, help: 1 });
    all = applyCounts(all, HOST, { general: 2 });
    expect(all[HOST]).toEqual({ general: 2 });
  });

  it("treats a zero as an absence", () => {
    const all = applyCounts({}, HOST, { general: 0 });
    expect(all[HOST]).toBeUndefined();
  });

  it("drops the server when nothing is left", () => {
    let all = applyCounts({}, HOST, { general: 1 });
    all = applyCounts(all, HOST, {});
    expect(HOST in all).toBe(false);
  });

  it("counts one more while connected", () => {
    let all = applyCounts({}, HOST, { general: 1 });
    all = addMention(all, HOST, "general");
    all = addMention(all, HOST, "random");
    expect(all[HOST]).toEqual({ general: 2, random: 1 });
  });

  it("keeps servers apart", () => {
    let all = addMention({}, HOST, "general");
    all = addMention(all, OTHER, "general");
    expect(all[HOST].general).toBe(1);
    expect(all[OTHER].general).toBe(1);
  });

  it("clears one conversation and leaves the rest", () => {
    let all = applyCounts({}, HOST, { general: 2, help: 1 });
    all = clearMentions(all, HOST, "general");
    expect(all[HOST]).toEqual({ help: 1 });
  });

  it("forgets the server once its last one is read", () => {
    let all = applyCounts({}, HOST, { general: 2 });
    all = clearMentions(all, HOST, "general");
    expect(HOST in all).toBe(false);
  });

  it("does nothing when there is nothing to clear", () => {
    const all: MentionsByHost = applyCounts({}, HOST, { general: 1 });
    // Same object back, so a React state update is skipped rather than
    // re-rendering every channel row for a tap that changed nothing.
    expect(clearMentions(all, HOST, "random")).toBe(all);
    expect(clearMentions(all, OTHER, "general")).toBe(all);
  });

  it("adds up one server's", () => {
    const all = applyCounts({}, HOST, { general: 2, help: 1 });
    expect(totalFor(all, HOST)).toBe(3);
    expect(totalFor(all, OTHER)).toBe(0);
  });
});
