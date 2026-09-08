import type { LinkPreviewData } from "@gryt/core";

import { getServerHttpBase } from "../servers/address";

/**
 * Link previews on a phone: getting them, and remembering what came back. What a preview
 * *means* is in `@gryt/core`. No player — this app has no WebView.
 */

export {
  describePreviewFailure,
  extractUrls,
  getAccentColor,
  getCardSubtitle,
  getLinkCardLayout,
  getLinkProvider,
  getProviderDetail,
  getProviderLogo,
  hostnameOf,
  LINK_PROVIDERS,
  LOGO_VIEW_BOX,
  type LinkCardLayout,
  type LinkPreviewData,
  type LinkProvider,
} from "@gryt/core";

/**
 * Previews already fetched, so scrolling back up does not ask again. A module-level Map:
 * it lives as long as the process, and the server caches for an hour behind it.
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
    /* 4xx is the server's verdict and will not change; 5xx and a dropped connection are
       worth another go. A 404 page arrives as a 200 carrying `status: 404`. */
    if (response.status >= 400 && response.status < 500) refused.add(url);
    return null;
  }

  const data = (await response.json()) as LinkPreviewData;
  cache.set(url, data);
  return data;
}
