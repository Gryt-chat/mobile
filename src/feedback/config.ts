import Constants from "expo-constants";

/**
 * Where reports go, and what this app calls itself. `Gryt-chat/reports` is the product's
 * inbox rather than part of a Gryt server, so unlike the auth server there is nothing
 * here to point elsewhere. The app key went out in GRYT-529.
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
