/**
 * The colours a role can be given without a picker: ten hues, ported from the
 * desktop's `roleColorPresets.ts`. Every one clears AA once banded.
 */
export const ROLE_COLOR_PRESETS = [
  { name: "Ember", value: "#df6862" },
  { name: "Amber", value: "#d67523" },
  { name: "Moss", value: "#af8f00" },
  { name: "Fern", value: "#4ea954" },
  { name: "Teal", value: "#00aea6" },
  { name: "Sky", value: "#00a1db" },
  { name: "Iris", value: "#648eed" },
  { name: "Violet", value: "#a17adf" },
  { name: "Plum", value: "#c46dbd" },
  { name: "Rose", value: "#d76797" },
] as const;

/** A colour for a role that does not have one yet: the first preset nobody is
    using, wrapping once all ten are spoken for. */
export function nextUnusedPreset(taken: (string | null | undefined)[]): string {
  const used = new Set(taken.filter((c): c is string => !!c).map((c) => c.toLowerCase()));
  const free = ROLE_COLOR_PRESETS.find((p) => !used.has(p.value.toLowerCase()));
  return (free ?? ROLE_COLOR_PRESETS[used.size % ROLE_COLOR_PRESETS.length]).value;
}
