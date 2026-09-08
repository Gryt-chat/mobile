import { Dimensions, Platform } from "react-native";
import Constants from "expo-constants";

import { useOptionalConnections } from "../connection/ConnectionsProvider";
import { useShell } from "../shell/ShellContext";
import { lastRoute, sessionUptimeSec } from "./session";
import type { Diagnostics } from "@gryt/core";

/**
 * What the app knows about itself, for a report nobody should have to fill in — the
 * app version, build number and OS version every report needs, plus what a phone can
 * answer without a new native module. Best-effort and nullable throughout.
 */
export function useDiagnostics(): Diagnostics {
  /* Optional, because this screen is pushed over the tabs rather than living inside
   * them. A report from the You page cannot say which server. */
  const active = useOptionalConnections()?.active ?? null;
  const { voiceChannel } = useShell();

  const screen = Dimensions.get("window");

  return {
    version: Constants.expoConfig?.version ?? null,
    /* The build baked into the binary first, and the config's only if there is none: on
     * a dev client `app.json` is already the *next* build. Android has `versionCode`. */
    build: buildNumber(),

    platform: Platform.OS,
    osVersion: Platform.Version,
    /* No `isEmulator`: `Constants.isDevice` was removed in expo-constants 57 and the
     * answer lives in `expo-device`, which is not a dependency. */
    screen: { width: screen.width, height: screen.height, scale: screen.scale },
    /* Not the locale — that would need `expo-localization`. The zone is what
     * makes a timestamp in a log line readable, and `Intl` has it already. */
    timezone: safeTimezone(),

    engine: "HermesInternal" in global ? "hermes" : null,
    reactNativeVersion: rnVersion(),
    expoVersion: Constants.expoVersion ?? null,

    /* Where they were before the form, not the form. See `lastRoute`. */
    route: lastRoute(),
    serverVersion:
      active?.state.status === "ready" ? (active.state.details?.version ?? null) : null,
    connected: active ? active.online : null,
    voiceActive: voiceChannel !== null,
    sessionUptimeSec: sessionUptimeSec(),
  };
}

/** The binary's build number, or the config's where the binary has none. */
function buildNumber(): string | null {
  const native = Constants.platform?.ios?.buildNumber;
  if (native) return String(native);

  const config = Constants.expoConfig;
  const configured = config?.ios?.buildNumber ?? config?.android?.versionCode;
  return configured === undefined || configured === null ? null : String(configured);
}

/** `Intl` is there on Hermes, but a report is not worth a crash if it is not. */
function safeTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function rnVersion(): string | null {
  const v = Platform.constants?.reactNativeVersion;
  if (!v) return null;
  const base = `${v.major}.${v.minor}.${v.patch}`;
  return v.prerelease ? `${base}-${v.prerelease}` : base;
}
