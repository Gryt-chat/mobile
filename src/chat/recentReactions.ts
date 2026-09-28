import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The desktop's `recentReactions.ts`, ported to `AsyncStorage`. Same shape, same
 * per-host key, same most-used-wins ordering.
 */
interface ReactionUse {
  src: string;
  count: number;
  usedAt: number;
}

const STORAGE_PREFIX = "gryt:recentReactions";
const MAX_STORED = 30;
const DEFAULT_REACTIONS = ["\u{1F44D}", "❤️", "\u{1F602}", "\u{1F62E}", "\u{1F622}", "\u{1F44E}"];

function storageKey(serverHost: string | undefined): string {
  return serverHost ? `${STORAGE_PREFIX}:${serverHost}` : STORAGE_PREFIX;
}

async function readStorage(serverHost: string | undefined): Promise<ReactionUse[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(serverHost));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is ReactionUse =>
        !!v && typeof v === "object" &&
        typeof (v as ReactionUse).src === "string" &&
        typeof (v as ReactionUse).count === "number" &&
        typeof (v as ReactionUse).usedAt === "number",
    );
  } catch {
    return [];
  }
}

async function writeStorage(serverHost: string | undefined, list: ReactionUse[]): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(serverHost), JSON.stringify(list));
  } catch {
    // Storage full or unavailable. The order holds for this session and resets next launch.
  }
}

function padWithDefaults(picked: string[], count: number): string[] {
  if (picked.length >= count) return picked.slice(0, count);
  const filler = DEFAULT_REACTIONS.filter((d) => !picked.includes(d));
  return [...picked, ...filler].slice(0, count);
}

/** Most recently used first, padded with the same defaults the desktop falls back to. */
export async function getRecentReactions(count = 16, serverHost?: string): Promise<string[]> {
  const stored = (await readStorage(serverHost)).sort((a, b) => b.usedAt - a.usedAt);
  return padWithDefaults(stored.map((r) => r.src), count);
}

/** Called once a reaction is actually sent — not on every open of the picker. */
export async function recordReaction(src: string, serverHost?: string): Promise<void> {
  const stored = await readStorage(serverHost);
  const existing = stored.find((r) => r.src === src);
  const updated = existing
    ? stored.map((r) => (r.src === src ? { ...r, count: r.count + 1, usedAt: Date.now() } : r))
    : [{ src, count: 1, usedAt: Date.now() }, ...stored];

  const trimmed = [...updated].sort((a, b) => b.count - a.count || b.usedAt - a.usedAt).slice(0, MAX_STORED);
  await writeStorage(serverHost, trimmed);
}
