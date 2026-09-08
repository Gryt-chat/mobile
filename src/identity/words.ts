/* The identity as 24 words, encoded in `@gryt/crypto` against a fixed vector. Drifting
 * would not fail loudly: a changed encoding still round-trips against itself. */

export { BACKUP_WORDS, seedToWords, wordsToSeed } from "@gryt/crypto";
