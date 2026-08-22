/**
 * The shape `Gryt-chat/reports` takes, and how this app fills it in.
 *
 * `POST /v1/reports`. Only `type` and `message` are required — everything else
 * is diagnostics, and the service is explicit that a field an app gets wrong is
 * truncated or dropped rather than a reason to reject: "a report lost to a
 * validation error is a bug nobody hears about."
 *
 * That cuts both ways, and it is why this file is pure and tested. Nothing here
 * throws and nothing here is required to succeed; a diagnostic this app cannot
 * work out is left off rather than sent as a guess, because a wrong OS version
 * in a bug report is worse than no OS version.
 */

export type ReportType = "bug" | "feedback";

/** The fields this app can actually fill. The service accepts more. */
export interface Report {
  type: ReportType;
  message: string;
  title?: string;
  app?: {
    version?: string;
    build?: string;
    channel?: string;
  };
  device?: {
    platform?: string;
    osVersion?: string;
    isEmulator?: boolean;
    screen?: { width: number; height: number; scale: number };
    timezone?: string;
  };
  runtime?: {
    engine?: string;
    reactNativeVersion?: string;
    expoVersion?: string;
  };
  context?: {
    route?: string;
    serverVersion?: string;
    connected?: boolean;
    voiceActive?: boolean;
    /** "It broke twenty minutes in" and "it broke on launch" are different bugs. */
    sessionUptimeSec?: number;
  };
}

/**
 * What the app knows about itself when somebody opens the form.
 *
 * Passed in rather than read here, so this stays testable: every one of these
 * comes from a module that needs a device — `expo-constants`, `Platform`,
 * `Dimensions`, the connection. The decisions about what to include and how to
 * trim are the part worth having tests on.
 */
export interface Diagnostics {
  version?: string | null;
  build?: string | null;
  channel?: string | null;
  platform?: string | null;
  osVersion?: string | number | null;
  isEmulator?: boolean | null;
  screen?: { width: number; height: number; scale: number } | null;
  timezone?: string | null;
  engine?: string | null;
  reactNativeVersion?: string | null;
  expoVersion?: string | null;
  route?: string | null;
  serverVersion?: string | null;
  connected?: boolean | null;
  voiceActive?: boolean | null;
  sessionUptimeSec?: number | null;
}

/**
 * The service truncates, but a phone should not send a novel either.
 *
 * Generous rather than tight: somebody describing a bug properly is the good
 * case, and cutting them off at a tweet is how you get "it broke" instead.
 */
export const MESSAGE_MAX = 4000;
export const TITLE_MAX = 120;

/**
 * `ios` on the wire, "iOS" on the screen.
 *
 * The service's enum is lowercase and the report keeps it that way. This is
 * only for the list somebody reads before sending, where a bare "ios" next to a
 * version number reads as a typo — the same call the Version row on the
 * preferences page already makes, and for the same reason "Ios" would be worse
 * than either.
 */
/** "2 min", not "127 s". A duration somebody reads, not a field. */
function uptime(seconds: number | undefined): string | undefined {
  if (seconds === undefined) return undefined;
  if (seconds < 90) return `${seconds} sec`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min`;
  return `${Math.round(minutes / 60)} h`;
}

function platformLabel(platform: string): string {
  if (platform === "ios") return "iOS";
  if (platform === "android") return "Android";
  if (platform === "macos") return "macOS";
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

/** Trimmed, capped, and undefined rather than empty. */
function text(value: string | null | undefined, max: number): string | undefined {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/** Only the keys that have a value, or undefined if none of them do. */
function some<T extends object>(entries: T): T | undefined {
  const kept = Object.entries(entries).filter(([, v]) => v !== undefined);
  return kept.length ? (Object.fromEntries(kept) as T) : undefined;
}

function str(value: string | number | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  return s ? s : undefined;
}

function bool(value: boolean | null | undefined): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * Assemble what gets sent.
 *
 * `type` and `message` always; every diagnostic only if it is actually known.
 * An empty `device` object says "this app does not collect device information",
 * which is a different and wronger claim than leaving it off.
 */
export function buildReport(
  type: ReportType,
  input: { message: string; title?: string },
  diagnostics: Diagnostics = {},
): Report {
  return {
    type,
    // Capped rather than validated. The service rejects only an empty message,
    // and the form is what stops it being empty.
    message: text(input.message, MESSAGE_MAX) ?? "",
    title: text(input.title, TITLE_MAX),
    app: some({
      version: str(diagnostics.version),
      build: str(diagnostics.build),
      channel: str(diagnostics.channel),
    }),
    device: some({
      platform: str(diagnostics.platform),
      osVersion: str(diagnostics.osVersion),
      isEmulator: bool(diagnostics.isEmulator),
      screen: diagnostics.screen ?? undefined,
      timezone: str(diagnostics.timezone),
    }),
    runtime: some({
      engine: str(diagnostics.engine),
      reactNativeVersion: str(diagnostics.reactNativeVersion),
      expoVersion: str(diagnostics.expoVersion),
    }),
    context: some({
      route: str(diagnostics.route),
      serverVersion: str(diagnostics.serverVersion),
      connected: bool(diagnostics.connected),
      voiceActive: bool(diagnostics.voiceActive),
      sessionUptimeSec:
        typeof diagnostics.sessionUptimeSec === "number" &&
        Number.isFinite(diagnostics.sessionUptimeSec)
          ? diagnostics.sessionUptimeSec
          : undefined,
    }),
  };
}

/**
 * The same diagnostics, as lines to show somebody before they send.
 *
 * A form that quietly ships a route, a server version and a build number is
 * worse than one that says so — and this is the list that makes "what is
 * attached" answerable without reading the source. It is built from the report
 * rather than from the inputs, so it cannot drift from what actually goes.
 */
export function describeAttached(report: Report): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [];
  const add = (label: string, value: string | undefined) => {
    if (value) lines.push({ label, value });
  };

  const app = report.app;
  add("Gryt", app?.version && app?.build ? `${app.version} (${app.build})` : app?.version);
  add("Channel", app?.channel);
  add(
    "Device",
    report.device?.platform && report.device?.osVersion
      ? `${platformLabel(report.device.platform)} ${report.device.osVersion}`
      : report.device?.platform && platformLabel(report.device.platform),
  );
  add("Simulator", report.device?.isEmulator ? "yes" : undefined);
  add("React Native", report.runtime?.reactNativeVersion);
  add("Screen", report.device?.screen
    ? `${report.device.screen.width}×${report.device.screen.height} @${report.device.screen.scale}x`
    : undefined);
  add("Timezone", report.device?.timezone);
  add("Where you were", report.context?.route);
  add("Running for", uptime(report.context?.sessionUptimeSec));
  add("Server", report.context?.serverVersion);

  return lines;
}
