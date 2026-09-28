import { base64Url, base64UrlDecode } from "@gryt/crypto";

import type { ArchiveDb, Statement } from "./archiveDb";
import type { RecordSealer } from "./archiveKey";
import type { MlsDeviceRecord, MlsGroupRecord, MlsKeyPackageRecord, MlsStateStore } from "./mlsStateTypes";

type Kind = "device" | "keyPackage" | "group";

interface MlsRow {
  id: string;
  iv: Uint8Array;
  ct: Uint8Array;
}

const BYTES = "$bytes";

function encode(value: unknown): Uint8Array {
  const json = JSON.stringify(value, (_k, v: unknown) => (v instanceof Uint8Array ? { [BYTES]: base64Url(v) } : v));
  return new TextEncoder().encode(json);
}

function decode<T>(bytes: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(bytes), (_k, v: unknown) =>
    v && typeof v === "object" && typeof (v as Record<string, unknown>)[BYTES] === "string"
      ? base64UrlDecode((v as Record<string, string>)[BYTES])
      : v,
  ) as T;
}

/** The same record names the desktop store seals under. */
function context(scope: string, kind: Kind, id: string): string {
  return `mls:${JSON.stringify([scope, kind, id])}`;
}

const SELECT_ONE = "SELECT id, iv, ct FROM mls WHERE scope = ? AND kind = ? AND id = ?";
const SELECT_KIND = "SELECT id, iv, ct FROM mls WHERE scope = ? AND kind = ?";
const UPSERT = "INSERT OR REPLACE INTO mls (scope, kind, id, iv, ct) VALUES (?, ?, ?, ?, ?)";
const DELETE = "DELETE FROM mls WHERE scope = ? AND kind = ? AND id = ?";

/** The MLS driver's state for one server, in the archive database. */
export class SqliteMlsStateStore implements MlsStateStore {
  private readonly db: ArchiveDb;
  private readonly sealer: RecordSealer;
  private readonly scope: string;

  constructor(db: ArchiveDb, sealer: RecordSealer, scope: string) {
    this.db = db;
    this.sealer = sealer;
    this.scope = scope;
  }

  loadDevice(): Promise<MlsDeviceRecord | null> {
    return this.read("device", "");
  }

  saveDevice(device: MlsDeviceRecord): Promise<void> {
    return this.write([["device", "", device]]);
  }

  putKeyPackages(records: MlsKeyPackageRecord[]): Promise<void> {
    return this.write(records.map((r) => ["keyPackage", r.ref, r]));
  }

  getKeyPackage(ref: string): Promise<MlsKeyPackageRecord | null> {
    return this.read("keyPackage", ref);
  }

  listKeyPackages(): Promise<MlsKeyPackageRecord[]> {
    return this.list("keyPackage");
  }

  deleteKeyPackage(ref: string): Promise<void> {
    return this.remove("keyPackage", ref);
  }

  loadGroup(conversationId: string): Promise<MlsGroupRecord | null> {
    return this.read("group", conversationId);
  }

  listGroups(): Promise<MlsGroupRecord[]> {
    return this.list("group");
  }

  /** `state` and `cursor` sit in one record, so they can't be written apart. */
  saveGroup(record: MlsGroupRecord): Promise<void> {
    return this.write([["group", record.conversationId, record]]);
  }

  deleteGroup(conversationId: string): Promise<void> {
    return this.remove("group", conversationId);
  }

  private async read<T>(kind: Kind, id: string): Promise<T | null> {
    const row = await this.db.first<MlsRow>(SELECT_ONE, [this.scope, kind, id]);
    return row ? this.open<T>(kind, row) : null;
  }

  private async list<T>(kind: Kind): Promise<T[]> {
    const rows = await this.db.all<MlsRow>(SELECT_KIND, [this.scope, kind]);
    return Promise.all(rows.map((row) => this.open<T>(kind, row)));
  }

  private async write(entries: [Kind, string, unknown][]): Promise<void> {
    const statements = await Promise.all(
      entries.map(async ([kind, id, value]): Promise<Statement> => {
        const sealed = await this.sealer.seal(context(this.scope, kind, id), encode(value));
        return [UPSERT, [this.scope, kind, id, sealed.iv, sealed.ct]];
      }),
    );
    await this.db.transaction(statements);
  }

  private remove(kind: Kind, id: string): Promise<void> {
    return this.db.transaction([[DELETE, [this.scope, kind, id]]]);
  }

  /** Throws on a record that won't open: guessing at MLS state forks the group. */
  private async open<T>(kind: Kind, row: MlsRow): Promise<T> {
    try {
      return decode<T>(await this.sealer.open(context(this.scope, kind, row.id), { iv: row.iv, ct: row.ct }));
    } catch {
      throw new Error(`MLS state for ${kind} ${row.id} can't be opened here`);
    }
  }
}
