import { useEffect, useState } from "react";
import { Image, Linking, Pressable, View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import * as WebBrowser from "expo-web-browser";
import { GlobeIcon } from "phosphor-react-native/src/icons/Globe";

import {
  describePreviewFailure,
  fetchLinkPreview,
  getAccentColor,
  getCachedPreview,
  getLinkCardLayout,
  getLinkProvider,
  getProviderDetail,
  hostnameOf,
  isPreviewRefused,
  type LinkPreviewData,
} from "./linkPreview";

/**
 * What a message links to, drawn rather than left as blue text.
 *
 * The desktop client puts a player in the message for YouTube, Spotify and the
 * rest. This does not: there is no WebView in this app, and the phone is the
 * device where an embedded player is least wanted anyway — the real app is
 * installed and handles the link better. So everything is a card, and the card
 * for a video carries its thumbnail. See `linkPreview.ts`.
 */

/** Same allow-list as the markdown renderer, for the same reasons. */
async function open(url: string) {
  try {
    if (/^https?:/i.test(url)) {
      await WebBrowser.openBrowserAsync(url);
      return;
    }
    if (await Linking.canOpenURL(url)) await Linking.openURL(url);
  } catch {
    /* The platform refusing to open a link is not something this app can fix,
       and a toast for it would be noise on a stray tap. */
  }
}

/**
 * One card, drawn from data that is already in hand.
 *
 * Split from the fetching so the component catalogue can draw every state
 * without a server, and so a card is a pure function of its preview.
 */
export function LinkPreviewCard({
  data,
  width,
}: {
  data: LinkPreviewData;
  /** Room the row leaves, so the picture is sized before it loads. */
  width: number;
}) {
  const theme = useTheme();
  const [imageFailed, setImageFailed] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);

  const url = data.url;
  const provider = getLinkProvider(url);
  const detail = getProviderDetail(url);
  const failure = describePreviewFailure(data.status);
  const layout = getLinkCardLayout(data);
  const accent =
    getAccentColor(url, data.themeColor, theme.appearance === "dark" ? "dark" : "light") ??
    theme.color.accent;

  const title = data.title || detail;

  /* The path detail is a subtitle only when it says something the title does
     not. Wikipedia titles its WebRTC page "WebRTC" and the detail read out of
     `/wiki/WebRTC` is "WebRTC", so showing both printed the word twice. */
  const subtitle =
    detail && data.title && !data.title.toLowerCase().includes(detail.toLowerCase())
      ? detail
      : null;

  const showImage = Boolean(data.image) && !imageFailed && layout !== "text" && layout !== "bare";

  /* The picture is drawn at the card's own width, minus the accent edge. Its
     height comes from the ratio the page declared, capped so one link cannot
     take over the screen. A page that declared no size gets 16:9, which is
     what a share card almost always is. */
  const innerWidth = Math.max(0, width - 4);
  const ratio =
    data.imageWidth && data.imageHeight ? data.imageWidth / data.imageHeight : 16 / 9;
  const imageHeight = Math.min(Math.round(innerWidth / ratio), 200);

  const picture = showImage ? (
    <Image
      source={{ uri: data.image! }}
      accessibilityLabel={data.imageAlt || data.title || undefined}
      onError={() => setImageFailed(true)}
      resizeMode="cover"
      style={
        layout === "thumbnail"
          ? { width: 72, height: 72, borderRadius: theme.radius.sm }
          : { width: innerWidth, height: imageHeight }
      }
    />
  ) : null;

  return (
    <Pressable
      onPress={() => open(url)}
      accessibilityRole="link"
      accessibilityLabel={title ? `${provider?.label ?? hostnameOf(url)}: ${title}` : url}
      style={({ pressed }) => ({
        width,
        flexDirection: "row",
        borderRadius: theme.radius.md,
        overflow: "hidden",
        backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surface,
        borderWidth: 1,
        borderColor: theme.color.border,
      })}
    >
      {/* The site's colour, or the app's when the site offers none. */}
      <View style={{ width: 4, backgroundColor: accent }} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <View style={{ flex: 1, minWidth: 0, padding: theme.space(3), gap: theme.space(1) }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2) }}>
              {data.favicon && !faviconFailed ? (
                <Image
                  source={{ uri: data.favicon }}
                  onError={() => setFaviconFailed(true)}
                  style={{ width: 14, height: 14, borderRadius: 2 }}
                />
              ) : (
                <GlobeIcon size={14} color={accent} weight="fill" />
              )}
              <Text
                numberOfLines={1}
                style={{ color: theme.color.muted, fontSize: 12, flexShrink: 1 }}
              >
                {provider?.label || data.siteName || hostnameOf(url)}
              </Text>
            </View>

            {title ? (
              <Text
                numberOfLines={2}
                style={{ color: theme.color.text, fontSize: 14.5, fontWeight: "600", lineHeight: 19 }}
              >
                {title}
              </Text>
            ) : null}

            {subtitle ? (
              <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 12.5 }}>
                {subtitle}
              </Text>
            ) : null}

            {data.description ? (
              <Text numberOfLines={3} style={{ color: theme.color.muted, fontSize: 13, lineHeight: 18 }}>
                {data.description}
              </Text>
            ) : null}

            {failure ? (
              <Text style={{ color: theme.color.muted, fontSize: 12.5, fontStyle: "italic" }}>
                {failure}
              </Text>
            ) : null}

            {!title && !data.description && !failure ? (
              <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 12.5 }}>
                {hostnameOf(url)}
              </Text>
            ) : null}
          </View>

          {layout === "thumbnail" && picture ? (
            <View style={{ padding: theme.space(3), paddingLeft: 0 }}>{picture}</View>
          ) : null}
        </View>

        {layout === "large" && picture ? picture : null}
      </View>
    </Pressable>
  );
}

/**
 * A card that has not arrived yet.
 *
 * The hostname is known from the URL before anything is fetched, so the
 * placeholder says which site is coming rather than being a grey slab.
 */
function LinkPreviewPending({ url, width }: { url: string; width: number }) {
  const theme = useTheme();
  const provider = getLinkProvider(url);
  const accent =
    getAccentColor(url, null, theme.appearance === "dark" ? "dark" : "light") ?? theme.color.accent;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Loading preview for ${hostnameOf(url)}`}
      style={{
        width,
        flexDirection: "row",
        borderRadius: theme.radius.md,
        overflow: "hidden",
        backgroundColor: theme.color.surface,
        borderWidth: 1,
        borderColor: theme.color.border,
      }}
    >
      <View style={{ width: 4, backgroundColor: accent }} />
      <View style={{ flex: 1, padding: theme.space(3), gap: theme.space(2) }}>
        <Text numberOfLines={1} style={{ color: theme.color.muted, fontSize: 12 }}>
          {provider?.label || hostnameOf(url)}
        </Text>
        <View style={{ height: 12, width: "70%", borderRadius: 4, backgroundColor: theme.color.surfaceHover }} />
        <View style={{ height: 10, width: "45%", borderRadius: 4, backgroundColor: theme.color.surfaceHover }} />
      </View>
    </View>
  );
}

/** One link: pending, then a card, or nothing at all. */
function LinkEmbed({
  url,
  host,
  getAccessToken,
  width,
}: {
  url: string;
  host: string;
  getAccessToken: () => Promise<string | null>;
  width: number;
}) {
  const [data, setData] = useState<LinkPreviewData | null>(() => getCachedPreview(url));
  const [failed, setFailed] = useState(() => isPreviewRefused(url));

  useEffect(() => {
    if (data || failed) return;
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          if (!cancelled) setFailed(true);
          return;
        }
        const preview = await fetchLinkPreview(host, token, url, controller.signal);
        if (cancelled) return;
        if (preview) setData(preview);
        else setFailed(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, host, getAccessToken, data, failed]);

  if (failed) return null;
  if (!data) return <LinkPreviewPending url={url} width={width} />;

  const layout = getLinkCardLayout(data);
  const failure = describePreviewFailure(data.status);
  /* Nothing came back and nothing can be said about why. The link is already
     in the message text, so a card carrying only a hostname adds nothing —
     unless we recognise the site, which is worth showing. */
  if (layout === "bare" && !failure && !getLinkProvider(url)) return null;

  return <LinkPreviewCard data={data} width={width} />;
}

/**
 * Every link in one message.
 *
 * Capped at three. A message that pastes eight links would otherwise push the
 * rest of the conversation off a phone screen, and the links themselves are
 * still there in the text.
 */
const MAX_EMBEDS_PER_MESSAGE = 3;

export function LinkEmbeds({
  urls,
  host,
  getAccessToken,
  width,
}: {
  urls: string[];
  host: string;
  getAccessToken: () => Promise<string | null>;
  width: number;
}) {
  const theme = useTheme();
  if (urls.length === 0) return null;

  return (
    <View style={{ gap: theme.space(2), paddingTop: theme.space(2) }}>
      {urls.slice(0, MAX_EMBEDS_PER_MESSAGE).map((url) => (
        <LinkEmbed key={url} url={url} host={host} getAccessToken={getAccessToken} width={width} />
      ))}
    </View>
  );
}
