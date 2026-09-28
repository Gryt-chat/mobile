/** One SQLite file for the message archive and the MLS state, so one key covers both. */

export type SqlValue = string | number | null | Uint8Array;

/** The part of expo-sqlite's `SQLiteDatabase` the archive uses, so tests can run on node:sqlite. */
export interface SqlDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<unknown>;
  getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export type Statement = [source: string, params: SqlValue[]];

/** Each server's MLS device id in the clear, so it can still be removed once the key is gone. */
const DEVICE_NOTE = "mls-device:";
/** Devices whose state was wiped, still to be removed from their servers. Survives a wipe. */
const RETIRED_SLOT = "retired-mls-devices";

export interface RetiredMlsDevice {
  scope: string;
  deviceId: string;
}

const text = (value: SqlValue | undefined): string | null =>
  typeof value === "string" ? value : value instanceof Uint8Array ? new TextDecoder().decode(value) : null;

function parseRetired(value: SqlValue | undefined): RetiredMlsDevice[] {
  try {
    const list = JSON.parse(text(value) ?? "[]") as unknown;
    return Array.isArray(list)
      ? list.filter((d): d is RetiredMlsDevice => typeof d?.scope === "string" && typeof d?.deviceId === "string")
      : [];
  } catch {
    return [];
  }
}

const NOTE_STATEMENT = "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)";

const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  scope TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  iv BLOB NOT NULL,
  ct BLOB NOT NULL,
  PRIMARY KEY (scope, conversation_id, message_id)
);
CREATE INDEX IF NOT EXISTS messages_by_time ON messages (scope, conversation_id, sent_at, message_id);
CREATE TABLE IF NOT EXISTS mls (
  scope TEXT NOT NULL,
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  iv BLOB NOT NULL,
  ct BLOB NOT NULL,
  PRIMARY KEY (scope, kind, id)
);
`;

/**
 * Every call runs alone and in order. expo-sqlite's transactions aren't exclusive, so without
 * this a read could land halfway through somebody else's batch on the same connection.
 */
export class ArchiveDb {
  private readonly sql: SqlDatabase;
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(sql: SqlDatabase) {
    this.sql = sql;
  }

  static async open(sql: SqlDatabase): Promise<ArchiveDb> {
    const db = new ArchiveDb(sql);
    await db.serial(async () => {
      await sql.execAsync("PRAGMA journal_mode = WAL");
      const row = await sql.getFirstAsync<{ user_version: number }>("PRAGMA user_version", []);
      if ((row?.user_version ?? 0) >= SCHEMA_VERSION) return;
      await sql.withTransactionAsync(async () => {
        await sql.execAsync(SCHEMA);
        await sql.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      });
    });
    return db;
  }

  first<T>(source: string, params: SqlValue[] = []): Promise<T | null> {
    return this.serial(() => this.sql.getFirstAsync<T>(source, params));
  }

  all<T>(source: string, params: SqlValue[] = []): Promise<T[]> {
    return this.serial(() => this.sql.getAllAsync<T>(source, params));
  }

  /** All of the statements land or none do. */
  transaction(statements: Statement[]): Promise<void> {
    if (statements.length === 0) return Promise.resolve();
    return this.serial(() =>
      this.sql.withTransactionAsync(async () => {
        for (const [source, params] of statements) await this.sql.runAsync(source, params);
      }),
    );
  }

  /** Empties every table, key check included. Every noted MLS device goes on the retired list. */
  wipe(): Promise<void> {
    return this.exclusive(async (sql) => {
      const rows = await sql.getAllAsync<{ key: string; value: SqlValue }>(
        "SELECT key, value FROM meta WHERE key = ? OR substr(key, 1, ?) = ?",
        [RETIRED_SLOT, DEVICE_NOTE.length, DEVICE_NOTE],
      );
      const retired = parseRetired(rows.find((r) => r.key === RETIRED_SLOT)?.value);
      for (const row of rows) {
        const deviceId = text(row.value);
        if (row.key === RETIRED_SLOT || !deviceId) continue;
        const scope = row.key.slice(DEVICE_NOTE.length);
        if (!retired.some((d) => d.scope === scope && d.deviceId === deviceId)) retired.push({ scope, deviceId });
      }
      await sql.runAsync("DELETE FROM messages", []);
      await sql.runAsync("DELETE FROM mls", []);
      await sql.runAsync("DELETE FROM meta", []);
      if (retired.length) await sql.runAsync(NOTE_STATEMENT, [RETIRED_SLOT, JSON.stringify(retired)]);
    });
  }

  /** The statement that notes a server's device id. The id isn't secret: the server hands it out. */
  static noteMlsDevice(scope: string, deviceId: string): Statement {
    return [NOTE_STATEMENT, [DEVICE_NOTE + scope, deviceId]];
  }

  async notedMlsDevice(scope: string): Promise<string | null> {
    return text((await this.first<{ value: SqlValue }>("SELECT value FROM meta WHERE key = ?", [DEVICE_NOTE + scope]))?.value);
  }

  async retiredMlsDevices(scope: string): Promise<string[]> {
    const row = await this.first<{ value: SqlValue }>("SELECT value FROM meta WHERE key = ?", [RETIRED_SLOT]);
    return parseRetired(row?.value).filter((d) => d.scope === scope).map((d) => d.deviceId);
  }

  /** Once the server has removed it, or said it never had it. */
  forgetRetiredMlsDevice(scope: string, deviceId: string): Promise<void> {
    return this.exclusive(async (sql) => {
      const row = await sql.getFirstAsync<{ value: SqlValue }>("SELECT value FROM meta WHERE key = ?", [RETIRED_SLOT]);
      const left = parseRetired(row?.value).filter((d) => d.scope !== scope || d.deviceId !== deviceId);
      if (left.length) await sql.runAsync(NOTE_STATEMENT, [RETIRED_SLOT, JSON.stringify(left)]);
      else await sql.runAsync("DELETE FROM meta WHERE key = ?", [RETIRED_SLOT]);
    });
  }

  /** Reads and writes in one transaction, with nothing else on this connection in between. */
  private exclusive(task: (sql: SqlDatabase) => Promise<void>): Promise<void> {
    return this.serial(() => this.sql.withTransactionAsync(() => task(this.sql)));
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
