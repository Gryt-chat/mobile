import type { NativeTheme } from "@gryt/ui-native";

/** The desktop call bar's one state language: neutral at rest, red when you've cut yourself
    off, green when you're sending camera or screen, and a lock for an admin's no. */
export type CallControlState = "idle" | "off" | "live" | "blocked";

export function microphoneState(muted: boolean, serverMuted: boolean): CallControlState {
  return serverMuted ? "blocked" : muted ? "off" : "idle";
}

export function hearingState(deafened: boolean, serverDeafened: boolean): CallControlState {
  return serverDeafened ? "blocked" : deafened ? "off" : "idle";
}

export interface CallControlColors {
  background: string;
  pressed: string;
  tint: string;
  opacity: number;
}

/** The web's `gryt-danger-4` and `-11` and so on. A ramp's index is the step minus one. */
export function callControlColors(theme: NativeTheme, state: CallControlState): CallControlColors {
  const { danger, success } = theme.scales;
  switch (state) {
    case "off":
      return { background: danger[3], pressed: danger[4], tint: danger[10], opacity: 1 };
    case "live":
      return { background: success[3], pressed: success[4], tint: success[10], opacity: 1 };
    case "blocked":
      return { background: theme.color.surfaceRaised, pressed: theme.color.surfaceRaised, tint: danger[10], opacity: 0.6 };
    default:
      return { background: theme.color.surfaceRaised, pressed: theme.color.surfaceHover, tint: theme.color.text, opacity: 1 };
  }
}
