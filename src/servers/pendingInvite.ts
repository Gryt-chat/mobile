import AsyncStorage from "@react-native-async-storage/async-storage";

/* The invite the add-server sheet was showing when "Sign in to join" was pressed. Android
   can replace the app while the browser is in front, so it is written down first. */

const KEY = "servers.pendingInvite";

/** Ten minutes: longer than a sign-in takes, so anything older is debris rather than a flow. */
export const PENDING_INVITE_MAX_AGE_MS = 10 * 60 * 1000;

interface PendingInvite {
  /** What the sheet's field held: a link or an address, as `parseServerInput` reads it. */
  input: string;
  at: number;
}

/** What a stored record says to reopen, or null when it is unreadable or too old. */
export function freshPendingInvite(raw: unknown, now = Date.now()): string | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { input, at } = parsed as Partial<PendingInvite>;
    if (typeof input !== "string" || !input.trim() || typeof at !== "number") return null;
    if (now - at > PENDING_INVITE_MAX_AGE_MS) return null;
    return input;
  } catch {
    return null;
  }
}

export async function rememberPendingInvite(input: string): Promise<void> {
  const record: PendingInvite = { input, at: Date.now() };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // The sheet is still up if the process survives, which on iOS it does.
  }
}

/** The invite to come back to, read once: the record goes whatever it held. */
export async function takePendingInvite(now = Date.now()): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw !== null) await AsyncStorage.removeItem(KEY);
    return freshPendingInvite(raw, now);
  } catch {
    return null;
  }
}
