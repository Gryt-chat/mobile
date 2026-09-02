import { describe, expect, it } from "vitest";

import { NAME_POOL, pickRandomName } from "./randomName";

describe("NAME_POOL", () => {
  /* A duplicate is a name twice as likely as the rest, and the pool exists to
     spread people out. */
  it("has no repeats", () => {
    expect(new Set(NAME_POOL).size).toBe(NAME_POOL.length);
  });

  /* Two people in a room of thirty sharing a name is the confusion the shared
     "You" caused. This does not make it impossible, only unlikely. */
  it("is big enough that a full server rarely doubles up", () => {
    expect(NAME_POOL.length).toBeGreaterThan(100);
  });

  /* These are drawn as an avatar, read aloud in voice, and shown in a member
     list beside names people chose. A stray space or empty string would render
     as a blank row, and the seed for the generated face would collapse. */
  it("is all single trimmed words", () => {
    for (const name of NAME_POOL) {
      expect(name).toBe(name.trim());
      expect(name).not.toMatch(/\s/);
      expect(name.length).toBeGreaterThan(2);
    }
  });

  /* The server caps a nickname at 50 characters and rejects a longer one, so a
     pool entry over that would be a join that fails rather than a long name. */
  it("stays inside the nickname the server will accept", () => {
    for (const name of NAME_POOL) expect(name.length).toBeLessThanOrEqual(50);
  });

  it("is capitalised, so a member list does not look sorted wrong", () => {
    for (const name of NAME_POOL) expect(name[0]).toBe(name[0].toUpperCase());
  });
});

describe("pickRandomName", () => {
  it("returns something from the pool", () => {
    for (let i = 0; i < 50; i++) {
      expect(NAME_POOL).toContain(pickRandomName());
    }
  });

  /* Not an assertion about randomness, which would be flaky. Only that it is
     not the same name every time — a pick that ignored the pool and returned
     the first entry would pass every test above this one. */
  it("does not hand out one fixed name", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pickRandomName());
    expect(seen.size).toBeGreaterThan(1);
  });
});
