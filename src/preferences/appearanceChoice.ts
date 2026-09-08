import type { GrytAppearance } from "@gryt/ui-native";

/**
 * Light, dark, or whatever the phone is set to — mobile was pinned to dark with a
 * comment saying it matched the web, and it did not. **Its own file**, because
 * `appearance.tsx` imports React and a test dies in the loader (GRYT-813).
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
 * The preference, and what the OS says, to the one appearance to paint with. `system`
 * is wider than the two answers anybody expects — `null` before the OS has answered,
 * and "unspecified" — and anything that is not "light" resolves to dark.
 */
export function resolveAppearance(
  preference: AppearancePreference,
  system: "light" | "dark" | "unspecified" | null | undefined,
): GrytAppearance {
  if (preference !== "system") return preference;
  return system === "light" ? "light" : "dark";
}

/**
 * Checked against the list rather than trusted: a value written by a later version has
 * to fall back to something paintable rather than a blank screen.
 */
export function isAppearance(value: string): value is AppearancePreference {
  return APPEARANCE_OPTIONS.some((o) => o.value === value);
}
