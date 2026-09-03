import type { LinkPreviewData } from "@gryt/core";

import { getServerHttpBase } from "../servers/address";

/**
 * Link previews on a phone: getting them, and remembering what came back.
 *
 * What a preview *means* — which site a URL belongs to, what colour its card
 * takes, what line to read out of its path, which of four shapes it earns —
 * moved to `@gryt/core`. The desktop was deciding all of that separately and
 * arriving at the same answers, which is two implementations of one idea.
 *
 * Fetching stayed. The two apps reach a server differently and neither way
 * belongs in a package that compiles without a platform, so the package decides
 * what a preview is and this goes and gets one.
 *
 * The other thing that stayed is the reason there is no player here. This app
 * has no WebView, and adding `react-native-webview` means a native dependency
 * and a new dev-client build for everybody. A phone is also the device where an
 * embedded player is worst: the real app is installed, it handles the link
 * better, and tapping through is one tap either way. So every link is a card,
 * and a card for a video shows its thumbnail.
 */

export {
  describePreviewFailure,
  extractUrls,
  getAccentColor,
  getCardSubtitle,
  getLinkCardLayout,
  getLinkProvider,
  getProviderDetail,
  hostnameOf,
  LINK_PROVIDERS,
  type LinkCardLayout,
  type LinkPreviewData,
  type LinkProvider,
} from "@gryt/core";

/**
 * Previews already fetched, so scrolling back up does not ask again.
 *
 * A plain module-level Map rather than anything cleverer: it lives as long as
 * the app process, the server caches for an hour behind it, and a chat that has
 * been open long enough to hold a thousand distinct links has bigger things in
 * memory than this.
 */
const cache = new Map<string, LinkPreviewData>();

/** URLs this server has already refused. Asking again gets the same answer. */
const refused = new Set<string>();

export function getCachedPreview(url: string): LinkPreviewData | null {
  return cache.get(url) ?? null;
}

export function isPreviewRefused(url: string): boolean {
  return refused.has(url);
}

export async function fetchLinkPreview(
  host: string,
  token: string,
  url: string,
  signal?: AbortSignal,
): Promise<LinkPreviewData | null> {
  const cached = cache.get(url);
  if (cached) return cached;
  if (refused.has(url)) return null;

  const endpoint = `${getServerHttpBase(host)}/api/link-preview?url=${encodeURIComponent(url)}`;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });

  if (!response.ok) {
    /* 4xx is the server's verdict on this URL and will not change: private,
       malformed, or not something it will fetch. 5xx and a dropped connection
       are worth another go, so they are not remembered.

       A page that 404s does not come through here. That is a 200 carrying
       `status: 404`, because "this page is gone" is a preview worth drawing. */
    if (response.status >= 400 && response.status < 500) refused.add(url);
    return null;
  }

  const data = (await response.json()) as LinkPreviewData;
  cache.set(url, data);
  return data;
}
