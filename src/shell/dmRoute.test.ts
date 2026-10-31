import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/* Every DM opens on the Messages tab, whichever screen it starts from (GRYT-1775). */
const OPENERS = [
  "src/shell/openDm.ts",
  "src/shell/MessagesScreen.tsx",
  "src/shell/FilteredSection.tsx",
  "src/preferences/PrivacyScreen.tsx",
];

describe("opening a direct message", () => {
  for (const file of OPENERS) {
    it(`${file} pushes a conversation onto Messages`, () => {
      const source = readFileSync(join(__dirname, "..", "..", file), "utf8");
      const pushes = [...source.matchAll(/router\.push\(\{ pathname: "([^"]+)", params: \{ id: ([^}]+) \}/g)];
      const dms = pushes.filter(([, , id]) => /conversation|^id\s*$/.test(id.trim()));
      expect(dms.length).toBeGreaterThan(0);
      for (const [, path] of dms) expect(path).toBe("/messages/conversation/[id]");
    });
  }
});
