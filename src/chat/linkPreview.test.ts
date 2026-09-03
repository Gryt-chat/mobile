import { describe, expect, it } from "vitest";

import {
  describePreviewFailure,
  extractUrls,
  getAccentColor,
  getLinkCardLayout,
  getLinkProvider,
  getProviderDetail,
  hostnameOf,
  LINK_PROVIDERS,
  type LinkPreviewData,
} from "./linkPreview";

/** A preview with nothing set, so each case names only what it needs. */
function preview(fields: Partial<LinkPreviewData> = {}): LinkPreviewData {
  return {
    url: "https://example.com/a",
    title: null,
    description: null,
    image: null,
    imageWidth: null,
    imageHeight: null,
    siteName: null,
    favicon: null,
    ...fields,
  };
}

describe("extractUrls", () => {
  it("finds the links in a message", () => {
    expect(extractUrls("see https://gryt.chat and https://example.com/x")).toEqual([
      "https://gryt.chat",
      "https://example.com/x",
    ]);
  });

  it("returns each link once, however many times it was pasted", () => {
    expect(extractUrls("https://a.example https://a.example")).toEqual(["https://a.example"]);
  });

  it("leaves code alone", () => {
    // A URL inside backticks is being quoted, not shared.
    expect(extractUrls("run `curl https://a.example` first")).toEqual([]);
    expect(extractUrls("```\nhttps://a.example\n```")).toEqual([]);
  });

  it("skips a markdown image, since the picture is already drawn", () => {
    expect(extractUrls("![alt](https://a.example/i.png)")).toEqual([]);
  });

  it("does not swallow the punctuation a sentence ends on", () => {
    expect(extractUrls("look at https://gryt.chat.")).toEqual(["https://gryt.chat"]);
  });

  it("has nothing to say about a message with no text", () => {
    expect(extractUrls(null)).toEqual([]);
    expect(extractUrls("")).toEqual([]);
  });
});

describe("getLinkCardLayout", () => {
  it("leads with a wide share card", () => {
    expect(
      getLinkCardLayout(preview({ title: "A", image: "i", imageWidth: 1200, imageHeight: 630 })),
    ).toBe("large");
  });

  it("puts a square image beside the text instead", () => {
    expect(
      getLinkCardLayout(preview({ title: "A", image: "i", imageWidth: 400, imageHeight: 400 })),
    ).toBe("thumbnail");
  });

  it("assumes an image of unknown size is a share card", () => {
    expect(getLinkCardLayout(preview({ title: "A", image: "i" }))).toBe("large");
  });

  it("sets aside no picture space when there is no picture", () => {
    expect(getLinkCardLayout(preview({ title: "A", description: "B" }))).toBe("text");
  });

  it("treats an empty preview as its own case", () => {
    // Not an empty large card: that is the grey rectangle this replaced.
    expect(getLinkCardLayout(preview())).toBe("bare");
  });
});

describe("describePreviewFailure", () => {
  it("says what a reader can act on", () => {
    expect(describePreviewFailure(403)).toBe("Private or sign-in only");
    expect(describePreviewFailure(404)).toBe("Page not found");
    expect(describePreviewFailure(429)).toBe("The site is rate limiting us");
  });

  it("stays quiet about everything else", () => {
    expect(describePreviewFailure(200)).toBeNull();
    expect(describePreviewFailure(500)).toBeNull();
    expect(describePreviewFailure(null)).toBeNull();
    // An older server sends no status at all.
    expect(describePreviewFailure(undefined)).toBeNull();
  });
});

describe("getLinkProvider", () => {
  it("knows a site by its hostname", () => {
    expect(getLinkProvider("https://github.com/Gryt-chat/gryt")?.id).toBe("github");
    expect(getLinkProvider("https://www.github.com/x/y")?.id).toBe("github");
    expect(getLinkProvider("https://modrinth.com/mod/sodium")?.id).toBe("modrinth");
  });

  it("matches a family of subdomains by suffix", () => {
    expect(getLinkProvider("https://en.wikipedia.org/wiki/WebRTC")?.id).toBe("wikipedia");
    expect(getLinkProvider("https://no.wikipedia.org/wiki/WebRTC")?.id).toBe("wikipedia");
  });

  it("is not fooled by a hostname that merely contains one", () => {
    expect(getLinkProvider("https://notgithub.com/x")).toBeNull();
    expect(getLinkProvider("https://github.com.evil.example/x")).toBeNull();
  });

  it("has no opinion about the rest of the web", () => {
    expect(getLinkProvider("https://gryt.chat/")).toBeNull();
    expect(getLinkProvider("not a url")).toBeNull();
  });
});

describe("getProviderDetail", () => {
  it("reads a GitHub path", () => {
    expect(getProviderDetail("https://github.com/Gryt-chat/gryt")).toBe("Gryt-chat/gryt");
    expect(getProviderDetail("https://github.com/Gryt-chat/gryt/pull/171")).toBe(
      "Gryt-chat/gryt · pull request #171",
    );
    expect(getProviderDetail("https://github.com/sivert-io")).toBe("@sivert-io");
    expect(getProviderDetail("https://github.com/")).toBeNull();
  });

  it("reads the others it knows", () => {
    expect(getProviderDetail("https://modrinth.com/mod/sodium")).toBe("Mod · sodium");
    expect(getProviderDetail("https://www.reddit.com/r/programming/")).toBe("r/programming");
    expect(getProviderDetail("https://www.npmjs.com/package/@types/node")).toBe("@types/node");
  });

  it("decodes a percent-encoded article title", () => {
    expect(getProviderDetail("https://en.wikipedia.org/wiki/Caf%C3%A9")).toBe("Café");
    expect(getProviderDetail("https://en.wikipedia.org/wiki/Rick_Astley")).toBe("Rick Astley");
  });

  it("says nothing for a site with no rule", () => {
    expect(getProviderDetail("https://gryt.chat/")).toBeNull();
  });
});

describe("getAccentColor", () => {
  it("prefers a brand we know over anything the page says", () => {
    expect(getAccentColor("https://modrinth.com/mod/sodium", "#ffffff", "dark")).toBe("#00AF5C");
  });

  it("lifts a near-black brand so the edge is visible on a dark card", () => {
    expect(getAccentColor("https://github.com/x/y", null, "dark")).toBe("#8B949E");
    expect(getAccentColor("https://github.com/x/y", null, "light")).toBe("#181717");
  });

  it("falls back to the colour an unknown site declares for itself", () => {
    expect(getAccentColor("https://example.com/", "#1bd96a", "dark")).toBe("#1bd96a");
    expect(getAccentColor("https://example.com/", null, "dark")).toBeNull();
  });
});

describe("hostnameOf", () => {
  it("drops the www and keeps everything else", () => {
    expect(hostnameOf("https://www.example.com/a/b?c=d")).toBe("example.com");
    expect(hostnameOf("https://docs.example.com/")).toBe("docs.example.com");
  });

  it("hands back what it was given when that is not a URL", () => {
    expect(hostnameOf("nonsense")).toBe("nonsense");
  });
});

describe("the provider list", () => {
  it("has one entry per id and a usable colour on each", () => {
    const ids = new Set<string>();
    for (const provider of LINK_PROVIDERS) {
      expect(ids.has(provider.id), `duplicate id ${provider.id}`).toBe(false);
      ids.add(provider.id);
      expect(provider.brand, provider.id).toMatch(/^#[0-9a-fA-F]{6}$/);
      if (provider.brandDark) {
        expect(provider.brandDark, provider.id).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
      expect(
        provider.hosts.length > 0 || (provider.hostSuffixes?.length ?? 0) > 0,
        `${provider.id} matches nothing`,
      ).toBe(true);
    }
  });
});
