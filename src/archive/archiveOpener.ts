import type { ArchiveDb } from "./archiveDb";
import { ArchiveKeyError, type ArchiveKeyErrorCode, type KeyVault, loadArchiveKey, type RandomBytes } from "./archiveKey";
import { MessageArchive } from "./messageArchive";
import { SqliteMlsStateStore } from "./mlsStateStore";

/* Opening, retrying and clearing the archive, with the database and Keychain passed in so the
 * whole path runs on node:sqlite in a test. The desktop's twin is `archive-opener.ts`. */

export interface LocalArchive {
  messages: MessageArchive;
  /** Matches the desktop's field. The phone's history lives in the app, never a browser. */
  home: "app";
  sealed: true;
  /** An archive was found whose key had gone, as after a restore onto a new phone, and was cleared. */
  lostHistory: boolean;
  /** One per server, keyed by the scope `identityScopeFor` gives. */
  mlsState(scope: string): SqliteMlsStateStore;
  /** MLS devices whose state was wiped here, still to be removed from that server. */
  retiredMlsDevices(scope: string): Promise<string[]>;
  forgetRetiredMlsDevice(scope: string, deviceId: string): Promise<void>;
}

export type LocalArchiveStatus =
  | { kind: "idle" }
  | { kind: "opening" }
  | { kind: "open" }
  /** Nothing was deleted. `code` is null for a failure that isn't about the key. */
  | { kind: "failed"; code: ArchiveKeyErrorCode | null; message: string };

export interface LocalArchiveSnapshot {
  status: LocalArchiveStatus;
  /** Goes up each time the archive is cleared. Anything holding the old one opens it again. */
  epoch: number;
}

export interface ArchiveOpenerOptions {
  openDb: () => Promise<ArchiveDb>;
  vault: KeyVault;
  random: RandomBytes;
}

export interface ArchiveOpener {
  /** Opened once. A failure isn't cached, so calling again tries again: that's the retry. */
  open(): Promise<LocalArchive>;
  /** Deletes messages, MLS state, the key and its check, then opens a fresh archive. */
  clear(): Promise<LocalArchive>;
  snapshot(): LocalArchiveSnapshot;
  subscribe(listener: () => void): () => void;
}

function failure(e: unknown): LocalArchiveStatus {
  const message = e instanceof Error ? e.message : String(e);
  return { kind: "failed", code: e instanceof ArchiveKeyError ? e.code : null, message };
}

export function createArchiveOpener({ openDb, vault, random }: ArchiveOpenerOptions): ArchiveOpener {
  let opening: Promise<LocalArchive> | null = null;
  let snapshot: LocalArchiveSnapshot = { status: { kind: "idle" }, epoch: 0 };
  const listeners = new Set<() => void>();

  const set = (status: LocalArchiveStatus, bumpEpoch = false) => {
    snapshot = { status, epoch: snapshot.epoch + (bumpEpoch ? 1 : 0) };
    for (const listener of listeners) listener();
  };

  async function openOnce(): Promise<LocalArchive> {
    const db = await openDb();
    const { sealer, lostHistory } = await loadArchiveKey(db, vault, random);
    return {
      messages: new MessageArchive(db, sealer),
      home: "app",
      sealed: true,
      lostHistory,
      mlsState: (scope) => new SqliteMlsStateStore(db, sealer, scope),
      retiredMlsDevices: (scope) => db.retiredMlsDevices(scope),
      forgetRetiredMlsDevice: (scope, deviceId) => db.forgetRetiredMlsDevice(scope, deviceId),
    };
  }

  function open(): Promise<LocalArchive> {
    if (opening) return opening;
    // A retry keeps showing the failure until it has an answer, so the notice doesn't flicker.
    if (snapshot.status.kind !== "failed") set({ kind: "opening" });
    const attempt: Promise<LocalArchive> = openOnce().then(
      (archive) => {
        if (opening === attempt) set({ kind: "open" });
        return archive;
      },
      (e: unknown) => {
        if (opening === attempt) {
          opening = null;
          set(failure(e));
        }
        throw e;
      },
    );
    opening = attempt;
    return attempt;
  }

  async function clear(): Promise<LocalArchive> {
    // One still opening finishes first, so a key it makes can't land after the wipe.
    await opening?.catch(() => undefined);
    opening = null;
    await (await openDb()).wipe();
    // After the wipe: a key gone first with the check still there would wipe again next launch.
    await vault.remove().catch((e: unknown) => console.warn("[Archive] Couldn't remove the old key:", e));
    set({ kind: "idle" }, true);
    return open();
  }

  return {
    open,
    clear,
    snapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
