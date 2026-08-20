/**
 * Two letters standing in for a server icon.
 *
 * The real icon is `/icon` on the server, which needs the host, a cache and a
 * fallback for the servers that have none — that is its own piece of work. Two
 * letters from the name is what the desktop client falls back to as well, so
 * this is the same answer arrived at earlier rather than a different one.
 */
export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
