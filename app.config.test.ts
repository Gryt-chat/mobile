import { describe, expect, it } from "vitest";

import appConfig from "./app.config";
import appJson from "./app.json";

/**
 * The key comes from the environment and the committed file stays empty.
 *
 * Worth a test rather than a comment: this repository is public, and the
 * failure mode is not a crash. A build that silently reads the empty default
 * ships an app whose reports are refused by production, and a change that
 * silently starts reading the committed value would publish the key. Neither
 * announces itself.
 */
const context = { config: appJson.expo } as never;

describe("app.config", () => {
  it("takes the app key from the build environment", () => {
    const before = process.env.REPORTS_APP_KEY;
    process.env.REPORTS_APP_KEY = "a-key-from-the-build";

    try {
      const config = appConfig(context);
      expect((config.extra?.reports as { appKey: string }).appKey).toBe(
        "a-key-from-the-build",
      );
    } finally {
      if (before === undefined) delete process.env.REPORTS_APP_KEY;
      else process.env.REPORTS_APP_KEY = before;
    }
  });

  it("is empty when the build did not set one, rather than inventing a value", () => {
    const before = process.env.REPORTS_APP_KEY;
    delete process.env.REPORTS_APP_KEY;

    try {
      const config = appConfig(context);
      expect((config.extra?.reports as { appKey: string }).appKey).toBe("");
    } finally {
      if (before !== undefined) process.env.REPORTS_APP_KEY = before;
    }
  });

  it("keeps the rest of app.json, including where reports go", () => {
    const config = appConfig(context);
    const reports = config.extra?.reports as { url: string; app: string };

    expect(config.name).toBe(appJson.expo.name);
    expect(config.slug).toBe(appJson.expo.slug);
    expect(reports.url).toBe("https://reports.gryt.chat");
    expect(reports.app).toBe("mobile");
  });

  it("has no key committed", () => {
    // The thing this whole file exists to prevent.
    expect(appJson.expo.extra.reports.appKey).toBe("");
  });
});
