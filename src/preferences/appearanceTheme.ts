import type { GrytTheme } from "@gryt/theme";
import { grytPresetsById } from "@gryt/theme";

const GRYT_NAME = "Gryt";

/** The theme picker's state, kept out of `appearance.tsx` so a test of it never
 * touches React — same reason `appearanceChoice.ts` is its own file. */

/** A theme saved on this phone from a pasted link or JSON. */
export interface SavedTheme {
  id: string;
  name: string;
  theme: GrytTheme;
}

const PRESET_PREFIX = "preset:";
const CUSTOM_PREFIX = "custom:";

/** The id a preset is selected by, matching the desktop's own `presetThemeId`. */
export function presetThemeId(presetId: string): string {
  return `${PRESET_PREFIX}${presetId}`;
}

/** A fresh id for a theme just imported. Nothing here needs to survive a
 * collision with anything but itself. */
export function customThemeId(): string {
  return `${CUSTOM_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** The bare preset id inside a theme id, or null when it names a custom theme
 * (or Gryt's own, at null). Lets a caller find which collection it lives in. */
export function presetIdFromThemeId(activeThemeId: string | null): string | null {
  if (activeThemeId === null || !activeThemeId.startsWith(PRESET_PREFIX)) return null;
  return activeThemeId.slice(PRESET_PREFIX.length);
}

/** The theme in use, or null for Gryt's own. A stale id — a preset the library
 * dropped, a custom theme already deleted — resolves to null rather than throwing. */
export function resolveActiveTheme(
  activeThemeId: string | null,
  customThemes: SavedTheme[],
): GrytTheme | null {
  if (activeThemeId === null) return null;

  if (activeThemeId.startsWith(PRESET_PREFIX)) {
    const preset = grytPresetsById.get(activeThemeId.slice(PRESET_PREFIX.length));
    return preset?.theme ?? null;
  }

  return customThemes.find((entry) => entry.id === activeThemeId)?.theme ?? null;
}

/** What the Preferences row shows as the current value. */
export function themeName(activeThemeId: string | null, customThemes: SavedTheme[]): string {
  if (activeThemeId === null) return GRYT_NAME;

  if (activeThemeId.startsWith(PRESET_PREFIX)) {
    const preset = grytPresetsById.get(activeThemeId.slice(PRESET_PREFIX.length));
    return preset?.name ?? GRYT_NAME;
  }

  return customThemes.find((entry) => entry.id === activeThemeId)?.name ?? GRYT_NAME;
}
