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

  /** Empties every table, key check included. For an archive whose key is gone for good. */
  wipe(): Promise<void> {
    return this.transaction([
      ["DELETE FROM messages", []],
      ["DELETE FROM mls", []],
      ["DELETE FROM meta", []],
    ]);
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
