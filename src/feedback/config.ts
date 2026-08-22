import Constants from "expo-constants";

/**
 * Where reports go, and what this app calls itself.
 *
 * `Gryt-chat/reports` is Gryt the product's inbox rather than part of a Gryt
 * server — a self-hoster never deploys it, and it is not reachable from a
 * server's configuration. So this is a build-time constant rather than
 * anything a person sets, and unlike the auth server there is nothing here for
 * a self-hoster to point somewhere else.
 *
 * ## The key
 *
 * `X-Gryt-App-Key` is a shared secret shipped inside the binary, and the
 * service is blunt that this is friction rather than authentication: anyone can
 * pull it out of a bundle or read one request in a proxy. What it buys is that
 * a scanner finding an open POST endpoint cannot fill the table overnight, and
 * that a leaked key can be rotated for this app without shipping the others.
 *
 * It lives in `app.json` under `extra.reports.appKey` rather than in source, so
 * setting it is a build concern and an empty one is obvious. It has to match an
 * entry in the service's `REPORTS_APP_KEYS=mobile:…`.
 *
 * **Empty is a working state, not a broken one.** The service allows unkeyed
 * submissions when it has no keys configured, which is how it runs on a laptop,
 * and the header is simply left off. Against a deployment that does have keys,
 * an empty one is refused — which is the right way round: a missing key should
 * fail against production and not against a dev box.
 */

interface ReportsConfig {
  url: string;
  /** The `X-Gryt-App` id. Must match a key entry on the service. */
  app: string;
  /** Empty until a build sets one. See above. */
  appKey: string;
}

const DEFAULT_URL = "https://reports.gryt.chat";

export function reportsConfig(): ReportsConfig {
  const extra = (Constants.expoConfig?.extra as { reports?: Partial<ReportsConfig> } | undefined)
    ?.reports;

  return {
    url: (extra?.url || DEFAULT_URL).replace(/\/+$/, ""),
    app: extra?.app || "mobile",
    appKey: extra?.appKey || "",
  };
}
