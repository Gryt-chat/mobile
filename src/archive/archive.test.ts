import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type { MlsGroupRecord, MlsKeyPackageRecord } from "@gryt/core";
import { describe, expect, it, vi } from "vitest";

import { ArchiveDb, type SqlDatabase, type SqlValue } from "./archiveDb";
import { type KeyVault, loadArchiveKey, type RecordSealer } from "./archiveKey";
import { type ArchivedMessage, MessageArchive } from "./messageArchive";
import { SqliteMlsStateStore } from "./mlsStateStore";

/* The phone's archive against real SQLite: node:sqlite behind the same async surface expo-sqlite has. */

const random = (n: number) => new Uint8Array(randomBytes(n));

/** `slow` hands back to the event loop per write, the way expo-sqlite's native calls do. */
function nodeSql(db: DatabaseSync, slow = false): SqlDatabase {
  return {
    execAsync: async (source) => void db.exec(source),
    runAsync: async (source, params) => {
      if (slow) await new Promise((resolve) => setImmediate(resolve));
      return db.prepare(source).run(...params);
    },
    getFirstAsync: async <T>(source: string, params: SqlValue[]) =>
      (db.prepare(source).get(...params) as T | undefined) ?? null,
    getAllAsync: async <T>(source: string, params: SqlValue[]) => db.prepare(source).all(...params) as T[],
    withTransactionAsync: async (task) => {
      db.exec("BEGIN");
      try {
        await task();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

function memoryVault(initial: string | null = null): KeyVault & { value: string | null } {
  const vault = {
    value: initial,
    read: async () => vault.value,
    write: async (value: string) => {
      vault.value = value;
    },
  };
  return vault;
}

async function fresh() {
  const raw = new DatabaseSync(":memory:");
  const db = await ArchiveDb.open(nodeSql(raw));
  const vault = memoryVault();
  const { sealer } = await loadArchiveKey(db, vault, random);
  return { raw, db, vault, sealer };
}

/** The same file after a restart: a new ArchiveDb and a key loaded again from the vault. */
async function reopen(raw: DatabaseSync, vault: KeyVault) {
  const db = await ArchiveDb.open(nodeSql(raw));
  return { db, ...(await loadArchiveKey(db, vault, random)) };
}

const msg = (over: Partial<ArchivedMessage>): ArchivedMessage => ({
  scope: "srv:a",
  conversationId: "c1",
  messageId: "m1",
  sentAt: 1,
  senderId: "u1",
  text: "hello",
  attachments: {},
  ...over,
});

function onDisk(raw: DatabaseSync, table: string): Buffer {
  const rows = raw.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
  return Buffer.concat(
    rows.flatMap((r) => Object.values(r).map((v) => (v instanceof Uint8Array ? Buffer.from(v) : Buffer.from(String(v))))),
  );
}

describe("message archive", () => {
  it("pages newest to oldest, each page oldest first, ties broken by messageId", async () => {
    const { db, sealer } = await fresh();
    const archive = new MessageArchive(db, sealer);
    const all = Array.from({ length: 7 }, (_, i) => msg({ messageId: `m${i}`, sentAt: 1000 + i, text: `t${i}` }));
    await archive.put([...all].reverse());
    await archive.put([msg({ messageId: "m6b", sentAt: 1006, text: "t6b" })]);

    const first = await archive.page("srv:a", "c1", { limit: 3 });
    expect(first.map((m) => m.messageId)).toEqual(["m5", "m6", "m6b"]);
    const second = await archive.page("srv:a", "c1", { limit: 3, before: first[0] });
    expect(second.map((m) => m.messageId)).toEqual(["m2", "m3", "m4"]);
    const last = await archive.page("srv:a", "c1", { limit: 3, before: second[0] });
    expect(last.map((m) => m.messageId)).toEqual(["m0", "m1"]);
    expect(await archive.page("srv:a", "c1", { before: last[0] })).toEqual([]);
  });

  it("keeps conversations and servers apart", async () => {
    const { db, sealer } = await fresh();
    const archive = new MessageArchive(db, sealer);
    await archive.put([
      msg({ messageId: "m1", sentAt: 1 }),
      msg({ conversationId: "c10", messageId: "m1", sentAt: 2 }),
      msg({ scope: "srv:b", messageId: "m1", sentAt: 3, text: "other server" }),
    ]);
    expect(await archive.page("srv:a", "c1")).toHaveLength(1);
    expect((await archive.get("srv:b", "c1", "m1"))?.text).toBe("other server");

    await archive.removeConversation("srv:a", "c1");
    expect(await archive.page("srv:a", "c1")).toEqual([]);
    expect(await archive.page("srv:a", "c10")).toHaveLength(1);
    expect(await archive.page("srv:b", "c1")).toHaveLength(1);
  });

  it("replaces a record on edit and drops it on delete", async () => {
    const { db, sealer } = await fresh();
    const archive = new MessageArchive(db, sealer);
    await archive.put([msg({ sentAt: 5 })]);
    await archive.put([msg({ sentAt: 5, text: "edited", editedAt: 9, senderDeviceId: "d1" })]);
    expect(await archive.get("srv:a", "c1", "m1")).toMatchObject({ text: "edited", editedAt: 9, senderDeviceId: "d1" });
    expect(await archive.page("srv:a", "c1")).toHaveLength(1);

    await archive.remove("srv:a", "c1", "m1");
    expect(await archive.get("srv:a", "c1", "m1")).toBeNull();
  });

  it("holds no plaintext on disk and reads back after a restart", async () => {
    const { raw, db, vault, sealer } = await fresh();
    const archive = new MessageArchive(db, sealer);
    expect(archive.sealed).toBe(true);
    const attachments = { f: { k: "x" } } as unknown as ArchivedMessage["attachments"];
    await archive.put([msg({ text: "a secret", attachments })]);
    expect(onDisk(raw, "messages").includes("a secret")).toBe(false);

    const again = await reopen(raw, vault);
    const got = await new MessageArchive(again.db, again.sealer).get("srv:a", "c1", "m1");
    expect(got).toMatchObject({ text: "a secret", attachments });
    expect(again.lostHistory).toBe(false);
  });

  it("won't open a record moved under another id or time", async () => {
    const { raw, db, sealer } = await fresh();
    const archive = new MessageArchive(db, sealer);
    await archive.put([msg({})]);
    raw.exec("INSERT INTO messages SELECT scope, 'c2', message_id, sent_at, iv, ct FROM messages");
    raw.exec("UPDATE messages SET sent_at = 99 WHERE conversation_id = 'c1'");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await archive.get("srv:a", "c2", "m1")).toBeNull();
      expect(await archive.page("srv:a", "c2")).toEqual([]);
      expect(await archive.page("srv:a", "c1")).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  it("tells listeners once per conversation, and stops when unsubscribed", async () => {
    const { db, sealer } = await fresh();
    const archive = new MessageArchive(db, sealer);
    const heard: unknown[] = [];
    const stop = archive.onChange((change) => heard.push(change));

    await archive.put([msg({ messageId: "m1" }), msg({ messageId: "m2" }), msg({ conversationId: "c2" })]);
    expect(heard).toEqual([
      { scope: "srv:a", conversationId: "c1" },
      { scope: "srv:a", conversationId: "c2" },
    ]);
    await archive.remove("srv:a", "c1", "m1");
    expect(heard).toHaveLength(3);
    stop();
    await archive.put([msg({ messageId: "m3" })]);
    expect(heard).toHaveLength(3);
  });

  it("never lets a read land halfway through a batch", async () => {
    const raw = new DatabaseSync(":memory:");
    const db = await ArchiveDb.open(nodeSql(raw, true));
    const { sealer } = await loadArchiveKey(db, memoryVault(), random);
    const archive = new MessageArchive(db, sealer);
    const batch = Array.from({ length: 40 }, (_, i) => msg({ messageId: `m${i}`, sentAt: i }));

    let done = false;
    const writing = archive.put(batch).then(() => (done = true));
    const seen: number[] = [];
    while (!done) {
      seen.push((await archive.page("srv:a", "c1", { limit: 100 })).length);
      await new Promise((resolve) => setImmediate(resolve));
    }
    await writing;
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((n) => n === 0 || n === 40)).toBe(true);
  });
});

describe("archive key", () => {
  it("is made once, kept in the vault, and the same key comes back", async () => {
    const { raw, vault } = await fresh();
    expect(vault.value).toMatch(/^[0-9a-f]{64}$/);
    const before = vault.value;
    await reopen(raw, vault);
    expect(vault.value).toBe(before);
  });

  it("clears an archive whose key is gone and starts again", async () => {
    const { raw, db, vault, sealer } = await fresh();
    await new MessageArchive(db, sealer).put([msg({})]);
    await new SqliteMlsStateStore(db, sealer, "srv:a").saveDevice(device);
    const oldKey = vault.value;
    vault.value = null;

    const again = await reopen(raw, vault);
    expect(again.lostHistory).toBe(true);
    expect(vault.value).not.toBe(oldKey);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM messages").get()).toEqual({ n: 0 });
    expect(await new SqliteMlsStateStore(again.db, again.sealer, "srv:a").loadDevice()).toBeNull();

    await new MessageArchive(again.db, again.sealer).put([msg({ text: "after" })]);
    expect((await reopen(raw, vault)).lostHistory).toBe(false);
  });

  it("throws on a key that doesn't match, and deletes nothing", async () => {
    const { raw, db, vault, sealer } = await fresh();
    await new MessageArchive(db, sealer).put([msg({})]);
    const other = memoryVault("11".repeat(32));
    await expect(reopen(raw, other)).rejects.toThrow(/doesn't match/);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM messages").get()).toEqual({ n: 1 });
    expect((await reopen(raw, vault)).lostHistory).toBe(false);
  });

  it("throws on a damaged key", async () => {
    const { raw } = await fresh();
    await expect(reopen(raw, memoryVault("not hex"))).rejects.toThrow(/damaged/);
    await expect(reopen(raw, memoryVault("abcd"))).rejects.toThrow(/damaged/);
  });

  it("writes nothing when the Keychain refuses the new key", async () => {
    const raw = new DatabaseSync(":memory:");
    const db = await ArchiveDb.open(nodeSql(raw));
    const refusing: KeyVault = {
      read: async () => null,
      write: async () => {
        throw new Error("keychain locked");
      },
    };
    await expect(loadArchiveKey(db, refusing, random)).rejects.toThrow(/keychain locked/);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM meta").get()).toEqual({ n: 0 });

    const vault = memoryVault();
    expect((await loadArchiveKey(db, vault, random)).lostHistory).toBe(false);
  });
});

const bytes = (...b: number[]) => new Uint8Array(b);
const device = { deviceId: "d1", signKey: bytes(1, 2, 3), publicKey: bytes(4), certificate: bytes(5, 6) };
const group = (conversationId: string, cursor = 0): MlsGroupRecord => ({
  conversationId,
  groupId: `g-${conversationId}`,
  state: bytes(9, 9, cursor),
  cursor,
  joinedEpoch: 1,
});

describe("MLS state store", () => {
  it("round-trips every record kind with nothing in the clear", async () => {
    const { raw, db, vault, sealer } = await fresh();
    const store = new SqliteMlsStateStore(db, sealer, "srv:a");

    expect(await store.loadDevice()).toBeNull();
    await store.saveDevice(device);
    expect(await store.loadDevice()).toEqual(device);

    const kp: MlsKeyPackageRecord = { ref: "r1", keyPackage: bytes(7), privatePackage: bytes(8), lastResort: false, createdAt: 3 };
    const lastResort = { ...kp, ref: "r2", lastResort: true, expiresAt: 1_800_000_000 };
    await store.putKeyPackages([kp, lastResort]);
    expect(await store.getKeyPackage("r1")).toEqual(kp);
    expect((await store.listKeyPackages()).sort((a, b) => a.ref.localeCompare(b.ref))).toEqual([kp, lastResort]);
    await store.deleteKeyPackage("r1");
    expect(await store.getKeyPackage("r1")).toBeNull();
    expect(await store.listKeyPackages()).toEqual([lastResort]);

    const pending = { ...group("c1", 4), pending: { commit: bytes(1), state: bytes(2) } };
    await store.saveGroup(pending);
    await store.saveGroup(group("c2", 7));
    expect(await store.loadGroup("c1")).toEqual(pending);
    await store.saveGroup({ ...group("c2", 8) });
    expect((await store.listGroups()).map((g) => [g.conversationId, g.cursor]).sort()).toEqual([
      ["c1", 4],
      ["c2", 8],
    ]);
    await store.deleteGroup("c1");
    expect(await store.loadGroup("c1")).toBeNull();

    const disk = onDisk(raw, "mls");
    expect(disk.includes(Buffer.from([9, 9, 8]))).toBe(false);
    expect(disk.includes("g-c2")).toBe(false);

    const again = await reopen(raw, vault);
    expect(await new SqliteMlsStateStore(again.db, again.sealer, "srv:a").loadGroup("c2")).toEqual(group("c2", 8));
  });

  it("gives each server its own state", async () => {
    const { db, sealer } = await fresh();
    const a = new SqliteMlsStateStore(db, sealer, "srv:a");
    const b = new SqliteMlsStateStore(db, sealer, "srv:b");
    await a.saveDevice(device);
    await a.saveGroup(group("c1"));
    expect(await b.loadDevice()).toBeNull();
    expect(await b.listGroups()).toEqual([]);
    expect(await b.loadGroup("c1")).toBeNull();
  });

  it("throws on a record that won't open rather than reading it as missing", async () => {
    const { raw, db, sealer } = await fresh();
    const store = new SqliteMlsStateStore(db, sealer, "srv:a");
    await store.saveGroup(group("c1"));
    raw.exec("INSERT INTO mls SELECT 'srv:b', kind, id, iv, ct FROM mls");
    raw.exec("INSERT INTO mls SELECT scope, 'keyPackage', id, iv, ct FROM mls WHERE scope = 'srv:a'");
    raw.exec("UPDATE mls SET id = 'c2' WHERE kind = 'group' AND scope = 'srv:a'");
    await expect(store.loadGroup("c2")).rejects.toThrow(/can't be opened/);
    await expect(store.listGroups()).rejects.toThrow(/can't be opened/);
    await expect(store.getKeyPackage("c1")).rejects.toThrow(/can't be opened/);
    await expect(new SqliteMlsStateStore(db, sealer, "srv:b").loadGroup("c1")).rejects.toThrow(/can't be opened/);
  });

  it("writes a batch of KeyPackages all or nothing", async () => {
    const { db, sealer } = await fresh();
    const store = new SqliteMlsStateStore(db, sealer, "srv:a");
    const failing: RecordSealer = {
      open: sealer.open,
      seal: async (context, plain) => {
        const sealed = await sealer.seal(context, plain);
        // A NULL iv breaks the NOT NULL constraint on the second row, inside the transaction.
        return context.includes("r2") ? { ...sealed, iv: null as unknown as Uint8Array } : sealed;
      },
    };
    const kp = (ref: string): MlsKeyPackageRecord => ({ ref, keyPackage: bytes(1), privatePackage: bytes(2), lastResort: false, createdAt: 0 });
    await expect(new SqliteMlsStateStore(db, failing, "srv:a").putKeyPackages([kp("r1"), kp("r2")])).rejects.toThrow();
    expect(await store.listKeyPackages()).toEqual([]);
    await store.putKeyPackages([kp("r3")]);
    expect(await store.listKeyPackages()).toHaveLength(1);
  });
});
