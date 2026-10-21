import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Picked } from "./staging";

/** What was in a conversation's composer when you left it (GRYT-1841). */
export interface Draft {
  text: string;
  staged: Picked[];
}

const PREFIX = "gryt.draft:";
const memory = new Map<string, Draft>();

export function draftKeyFor(host: string, conversationId: string): string {
  return `${host}::${conversationId}`;
}

const isEmpty = (draft: Draft) => !draft.text.trim() && draft.staged.length === 0;

/**
 * Keeps a draft for its conversation, or forgets it once it's empty. Channels go to disk
 * too; DMs don't, because their history on disk is sealed and a plain draft would undo that.
 */
export function keepDraft(key: string, draft: Draft, onDisk: boolean): void {
  if (isEmpty(draft)) memory.delete(key);
  else memory.set(key, draft);
  if (!onDisk) return;
  void (isEmpty(draft) ? AsyncStorage.removeItem(PREFIX + key) : AsyncStorage.setItem(PREFIX + key, JSON.stringify(draft))).catch(() => {});
}

/** The draft waiting for this conversation: the one from this run, else the one on disk. */
export async function draftFor(key: string, onDisk: boolean): Promise<Draft | null> {
  const kept = memory.get(key);
  if (kept || !onDisk) return kept ?? null;
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    const parsed = raw ? (JSON.parse(raw) as Partial<Draft>) : null;
    if (!parsed) return null;
    return { text: typeof parsed.text === "string" ? parsed.text : "", staged: Array.isArray(parsed.staged) ? parsed.staged : [] };
  } catch {
    return null;
  }
}
