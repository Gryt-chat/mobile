import type { GrytAppearance } from "@gryt/ui-native";

/**
 * Light, dark, or whatever the phone is set to.
 *
 * The desktop has had this for a while — System, Light, Dark, in that order,
 * with System the default — and mobile was pinned to dark with a comment saying
 * it matched the web. It did not. GRYT-813.
 *
 * An enum for the same reason `MessageLayout` is one, and here the third value
 * is not hypothetical: "system" is neither of the other two, it is a deferral to
 * the OS, and a boolean could not hold it at all.
 *
 * **Its own file, away from the provider.** `appearance.tsx` imports React and
 * `react-native`, and a test that imports it dies in the loader before it runs a
 * line — the same reason `tabs.ts` sits beside `TabBar.tsx` rather than in it.
 * Everything here is a decision with inputs and no renderer, so it is testable
 * and it is tested.
 */
export type AppearancePreference = "system" | "light" | "dark";

export const APPEARANCE_OPTIONS: {
  value: AppearancePreference;
  label: string;
  hint: string;
}[] = [
  {
    value: "system",
    label: "System",
    hint: "Follows the phone, and changes with it.",
  },
  { value: "light", label: "Light", hint: "Always light, even when the phone is dark." },
  { value: "dark", label: "Dark", hint: "Always dark, even when the phone is light." },
];

export const DEFAULT_APPEARANCE: AppearancePreference = "system";

/**
 * The preference, and what the OS says, to the one appearance to paint with.
 *
 * `system` is `useColorScheme()`, and its type is wider than the two answers
 * anybody expects: it is `null` before the OS has answered — on Android that is
 * the first frame of a cold start rather than an edge case — and it can be the
 * string "unspecified". Anything that is not "light" resolves to dark, so both
 * of those fall to the appearance Gryt has always had rather than flashing
 * white. That is why this takes the whole `ColorSchemeName` rather than
 * narrowing at the call site and deciding there instead.
 */
export function resolveAppearance(
  preference: AppearancePreference,
  system: "light" | "dark" | "unspecified" | null | undefined,
): GrytAppearance {
  if (preference !== "system") return preference;
  return system === "light" ? "light" : "dark";
}

/**
 * Checked against the list rather than trusted.
 *
 * A value written by a later version of the app has to fall back to something
 * paintable rather than to an appearance with no palette, which is a blank
 * screen rather than a wrong colour.
 */
export function isAppearance(value: string): value is AppearancePreference {
  return APPEARANCE_OPTIONS.some((o) => o.value === value);
}
