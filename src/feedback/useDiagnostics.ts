import { Dimensions, Platform } from "react-native";
import Constants from "expo-constants";

import { useOptionalConnections } from "../connection/ConnectionsProvider";
import { useShell } from "../shell/ShellContext";
import { lastRoute, sessionUptimeSec } from "./session";
import type { Diagnostics } from "@gryt/core";

/**
 * What the app knows about itself, for a report nobody should have to fill in.
 *
 * The service's README is blunt about which of these matter: "the three that
 * matter most — app version, build number, OS version — are the ones every bug
 * report needs and nobody remembers to include", and it notes the apps already
 * assemble them for the Version row on the preferences page. This is that,
 * plus the handful of things a phone can answer without a new native module.
 *
 * Everything here is best-effort and nullable. `buildReport` drops what is
 * missing rather than sending a guess.
 */
export function useDiagnostics(): Diagnostics {
  /* Optional, because this screen is pushed over the tabs rather than living
   * inside them — the connections are one layer down. A report from the You
   * page still knows which build it is; it just cannot say which server. */
  const active = useOptionalConnections()?.active ?? null;
  const { voiceChannel } = useShell();

  const screen = Dimensions.get("window");

  return {
    version: Constants.expoConfig?.version ?? null,
    /* The build baked into the binary first, and the config's only if there is
     * no binary answer.
     *
     * The order matters on a dev client, where the two disagree: `app.json` has
     * already been bumped to the *next* build, and a tester reporting "build 8"
     * while running 7 is worse than not asking. It is the same distinction the
     * Version row on the preferences page makes.
     *
     * The fallback is Android, where `Constants.platform.ios` does not exist
     * and no build number went at all — `versionCode` is where the same number
     * lives there. The two paths cannot disagree in a release build, because
     * the bundle and the binary are built from one commit. */
    build: buildNumber(),

    platform: Platform.OS,
    osVersion: Platform.Version,
    /* No `isEmulator`. Knowing a report came from a simulator would change how
     * it reads — no real microphone, no real radio, an audio stack that flakes
     * for reasons that are not the app's — but `Constants.isDevice` was removed
     * in expo-constants 57 and the answer now lives in `expo-device`, which is
     * not a dependency. `buildReport` still carries the field for whoever adds
     * it; this simply has nothing to put there.
     *
     * Caught by sending a real report and finding the column null. */
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
