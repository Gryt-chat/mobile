/** Set when the server refuses an upload for space (4.12), so the channel can say so above the composer. */
type Full = { used: number; limit: number };
const full = new Map<string, Full>();
const listeners = new Set<() => void>();

export function noteStorageFull(host: string, used: number, limit: number) {
  full.set(host, { used, limit });
  listeners.forEach((l) => l());
}

export const storageFull = {
  get: (host: string) => full.get(host),
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};
