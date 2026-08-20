import {
  entropyToMnemonic,
  mnemonicToEntropy,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

import { assertUsableSeed } from "./keys";

/* The identity as 24 words.
 *
 * A port of the desktop client's `seedToWords` / `wordsToSeed` (GRYT-255),
 * wordlist and error messages included. A phrase written down from one client
 * has to restore on the other, so this is the same encoding or it is worthless.
 *
 * The standard 2048-word list is 11 bits a word: 256 bits of seed plus 8 bits of
 * checksum makes 264, which is 24 words exactly. The checksum lives inside the
 * words rather than beside them, so a mistyped or reordered phrase is rejected
 * instead of quietly producing a different identity — and since no two words in
 * the list share their first four letters, a misread word usually is not a word
 * at all and fails before the checksum is even reached.
 *
 * Only the encoding is borrowed. The key-stretching step wallets do on top is
 * not wanted here: these 256 bits are the seed already.
 */

/** How many words a backup is. Stated once so the message and the check agree. */
export const BACKUP_WORDS = 24;

export function seedToWords(seed: Uint8Array): string {
  assertUsableSeed(seed);
  return entropyToMnemonic(seed, wordlist);
}

/**
 * Read a phrase back, or say what is wrong with it.
 *
 * The checksum catches roughly 255 mistakes in 256, which is worth having and
 * is not a guarantee — so this can say a phrase is wrong and cannot say which
 * word is. It is also not a security check: anyone can produce a valid phrase,
 * it only ever guards against fingers.
 */
export function wordsToSeed(phrase: string): Uint8Array {
  const normalised = phrase.trim().toLowerCase().split(/\s+/).join(" ");
  if (!normalised) throw new Error("Enter your identity words.");

  const count = normalised.split(" ").length;
  if (count !== BACKUP_WORDS) {
    throw new Error(`That is ${count} words — an identity backup is ${BACKUP_WORDS}.`);
  }
  if (!validateMnemonic(normalised, wordlist)) {
    throw new Error(
      "Those words aren't a valid identity backup. Check for a mistyped or swapped word.",
    );
  }

  const seed = mnemonicToEntropy(normalised, wordlist);
  assertUsableSeed(seed);
  return seed;
}
