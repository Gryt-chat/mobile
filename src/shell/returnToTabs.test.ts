import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

// Each of these, run from a root screen, mounts a second copy of the tabs (GRYT-1623).
const INTO_THE_TABS = [
  /<Redirect\s+href=["'`]\/(\(tabs\)|you|search)?["'`/]/,
  /router\.replace\(\s*["'`]\/(\(tabs\)|you|search)?["'`/]/,
  /router\.navigate\(\s*["'`]\/\(tabs\)/,
];

describe("getting back into the tabs", () => {
  it("goes through returnToTabs everywhere", () => {
    const offenders = [...sources(join(ROOT, "app")), ...sources(join(ROOT, "src"))]
      .filter((file) => {
        const text = readFileSync(file, "utf8");
        return INTO_THE_TABS.some((pattern) => pattern.test(text));
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  it("catches the shapes that stacked a second copy", () => {
    const old = [
      '<Redirect href="/" />',
      'router.replace("/")',
      'router.replace("/you")',
      'router.navigate("/(tabs)/(server)")',
    ];
    for (const line of old) expect(INTO_THE_TABS.some((pattern) => pattern.test(line))).toBe(true);
    const inside = ['router.replace("/channel/x")', '<Redirect href={{ pathname: "/channel/[id]" }} />'];
    for (const line of inside) expect(INTO_THE_TABS.some((pattern) => pattern.test(line))).toBe(false);
  });
});
