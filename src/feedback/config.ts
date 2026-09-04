import Constants from "expo-constants";

/**
 * Where reports go, and what this app calls itself.
 *
 * `Gryt-chat/reports` is Gryt the product's inbox rather than part of a Gryt
 * server — a self-hoster never deploys it, and it is not reachable from a
 * server's configuration. So this is a build-time constant, and unlike the auth
 * server there is nothing here for a self-hoster to point elsewhere.
 *
 * There used to be an `X-Gryt-App-Key` here too. GRYT-529 took it out at the
 * service: a key that ships inside a public app is not a secret, and the day it
 * needs rotating is the day everybody who has not updated stops being able to
 * report a bug.
 */

interface ReportsConfig {
  url: string;
  /** The `X-Gryt-App` id. Names which client this is, in the inbox and in bans. */
  app: string;
}

const DEFAULT_URL = "https://reports.gryt.chat";

export function reportsConfig(): ReportsConfig {
  const extra = (Constants.expoConfig?.extra as { reports?: Partial<ReportsConfig> } | undefined)
    ?.reports;

  return {
    url: (extra?.url || DEFAULT_URL).replace(/\/+$/, ""),
    app: extra?.app || "mobile",
  };
}
