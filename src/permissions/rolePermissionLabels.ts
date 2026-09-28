/** Humanizes a permission id the server sent — the catalogue is a flat list of
    snake_case words, not labels, and the phone has no room for a hand-kept map. */
export function humanizePermission(id: string): string {
  return id
    .split("_")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}
