import { grytMlsCryptoProvider, MLS_CIPHERSUITE } from "@gryt/crypto";

import { fromHex, toHex, utf8 } from "../identity/encoding";
import type { ArchiveDb } from "./archiveDb";

/**
 * The key the archive encrypts records with: AES-256-GCM through the Hermes crypto provider in
 * @gryt/crypto, with the AAD naming the record, as the desktop archive does it.
 */

const KEY_BYTES = 32;
const IV_BYTES = 12;
const AAD_PREFIX = "gryt-archive-v1:";

const CHECK_SLOT = "key-check";
const CHECK_CONTEXT = "key-check";
const CHECK_TEXT = "gryt-archive-key-check";

/** Where the key lives: the Keychain or Keystore. `read` gives null only when nothing is there. */
export interface KeyVault {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
}

/** Why the archive won't open. Nothing has been deleted when one of these is thrown. */
export type ArchiveKeyErrorCode = "unseal-failed" | "mismatch" | "damaged";

export class ArchiveKeyError extends Error {
  readonly code: ArchiveKeyErrorCode;

  constructor(code: ArchiveKeyErrorCode, message: string) {
    super(message);
    this.name = "ArchiveKeyError";
    this.code = code;
  }
}

const damaged = () => new ArchiveKeyError("damaged", "Your message history key is damaged.");

export type RandomBytes = (length: number) => Uint8Array;

export interface SealedBytes {
  iv: Uint8Array;
  ct: Uint8Array;
}

/** Seals and opens records. `context` names the record, so a value moved elsewhere won't open. */
export interface RecordSealer {
  seal(context: string, plain: Uint8Array): Promise<SealedBytes>;
  open(context: string, sealed: SealedBytes): Promise<Uint8Array>;
}

type SuiteRequest = Parameters<typeof grytMlsCryptoProvider.getCiphersuiteImpl>[0];
type Hpke = Awaited<ReturnType<typeof grytMlsCryptoProvider.getCiphersuiteImpl>>["hpke"];

let hpke: Promise<Hpke> | null = null;

function aead(): Promise<Hpke> {
  // Only the name is read, and only suite 1 is accepted.
  hpke ??= grytMlsCryptoProvider
    .getCiphersuiteImpl({ name: MLS_CIPHERSUITE } as SuiteRequest)
    .then((suite) => suite.hpke);
  return hpke;
}

export function recordSealer(key: Uint8Array, random: RandomBytes): RecordSealer {
  if (key.length !== KEY_BYTES) throw damaged();
  return {
    async seal(context, plain) {
      const iv = random(IV_BYTES);
      const ct = await (await aead()).encryptAead(key, iv, utf8(AAD_PREFIX + context), plain);
      return { iv, ct };
    },
    async open(context, sealed) {
      return (await aead()).decryptAead(key, sealed.iv, utf8(AAD_PREFIX + context), sealed.ct);
    },
  };
}

export interface LoadedArchiveKey {
  sealer: RecordSealer;
  /** An archive was here with its key gone from the Keychain, so it was cleared. */
  lostHistory: boolean;
}

function joinCheck(sealed: SealedBytes): Uint8Array {
  const out = new Uint8Array(sealed.iv.length + sealed.ct.length);
  out.set(sealed.iv);
  out.set(sealed.ct, sealed.iv.length);
  return out;
}

async function writeCheck(db: ArchiveDb, sealer: RecordSealer): Promise<void> {
  const check = joinCheck(await sealer.seal(CHECK_CONTEXT, utf8(CHECK_TEXT)));
  await db.transaction([["INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [CHECK_SLOT, check]]]);
}

async function checkMatches(sealer: RecordSealer, check: Uint8Array): Promise<boolean> {
  try {
    const sealed = { iv: check.slice(0, IV_BYTES), ct: check.slice(IV_BYTES) };
    return new TextDecoder().decode(await sealer.open(CHECK_CONTEXT, sealed)) === CHECK_TEXT;
  } catch {
    return false;
  }
}

/**
 * The archive key, made on first use. A key that doesn't match the archive throws. A missing key
 * clears the archive: the Keystore can't give it back, so those records are unreadable for good.
 */
export async function loadArchiveKey(db: ArchiveDb, vault: KeyVault, random: RandomBytes): Promise<LoadedArchiveKey> {
  let stored: string | null;
  try {
    stored = await vault.read();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new ArchiveKeyError("unseal-failed", `The Keychain wouldn't give up the message history key: ${detail}`);
  }
  const check = (await db.first<{ value: Uint8Array }>("SELECT value FROM meta WHERE key = ?", [CHECK_SLOT]))?.value;

  if (stored !== null) {
    let key: Uint8Array;
    try {
      key = fromHex(stored);
    } catch {
      throw damaged();
    }
    const sealer = recordSealer(key, random);
    if (!check) {
      await writeCheck(db, sealer);
    } else if (!(await checkMatches(sealer, check))) {
      throw new ArchiveKeyError("mismatch", "Your message history doesn't match this phone's key, so it can't be opened.");
    }
    return { sealer, lostHistory: false };
  }

  const lostHistory = check !== undefined;
  if (lostHistory) await db.wipe();

  // The Keychain first: a check row with no key behind it would clear the archive next launch.
  const key = random(KEY_BYTES);
  await vault.write(toHex(key));
  const sealer = recordSealer(key, random);
  await writeCheck(db, sealer);
  return { sealer, lostHistory };
}
