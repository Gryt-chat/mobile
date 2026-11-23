import AsyncStorage from "@react-native-async-storage/async-storage";

import type { LocalMessage } from "./outbox";
import type { Message } from "./types";

/** As many as a first page holds, so the page that arrives replaces them all. */
export const CACHED_PAGE = 50;
const MEMORY_LIMIT = 30;
const PREFIX = "channelPage:";

const memory = new Map<string, Message[]>();
const key = (host: string, channelId: string) => `${PREFIX}${host}\n${channelId}`;

/** The newest messages a channel showed, without drafts or anything sealed. */
export function pageToKeep(messages: readonly LocalMessage[]): Message[] {
  return messages
    .filter((m) => !m.pending && !m.failed && !m.sealed && !m.message_id.startsWith("pending:"))
    .slice(-CACHED_PAGE)
    .map(({ sealedState: _s, ...m }) => m);
}

export function cachedPage(host: string, channelId: string): Message[] | null {
  return memory.get(key(host, channelId)) ?? null;
}

export async function storedPage(host: string, channelId: string): Promise<Message[] | null> {
  try {
    const raw = await AsyncStorage.getItem(key(host, channelId));
    const parsed: Message[] | null = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function keepPage(host: string, channelId: string, page: Message[], persist: boolean): void {
  const k = key(host, channelId);
  memory.delete(k);
  memory.set(k, page);
  if (memory.size > MEMORY_LIMIT) memory.delete(memory.keys().next().value ?? k);
  if (persist) void AsyncStorage.setItem(k, JSON.stringify(page)).catch(() => undefined);
}

export async function forgetServerPages(host: string): Promise<void> {
  const prefix = `${PREFIX}${host}\n`;
  for (const k of [...memory.keys()]) if (k.startsWith(prefix)) memory.delete(k);
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(prefix)));
  } catch {
    // Left on disk, it's read only for a server you join again.
  }
}
