import type { LinkPreviewData } from "@gryt/core";

import { getServerHttpBase } from "../servers/address";

/**
 * Link previews on a phone: getting them, and remembering what came back.
 *
 * What a preview *means* — which site a URL belongs to, what colour its card
 * takes, which of four shapes it earns — is in `@gryt/core`, so the two apps
 * cannot arrive at different answers. Fetching stayed here: the two reach a
 * server differently and neither way belongs in a package that compiles without
 * a platform.
 *
 * There is no player because this app has no WebView, and adding
 * `react-native-webview` means a native dependency and a new dev-client build
 * for everybody. A phone is also where an embedded player is worst: the real
 * app is installed, it handles the link better, and tapping through is one tap
 * either way. So every link is a card, and a card for a video shows its
 * thumbnail.
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
 * Previews already fetched, so scrolling back up does not ask again. A plain
 * module-level Map: it lives as long as the process, and the server caches for
 * an hour behind it.
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
