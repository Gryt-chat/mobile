/* The identity as 24 words. The encoding moved to `@gryt/crypto`, which pins it to a
 * fixed vector — **this is the one duplicate where drifting would not fail loudly**,
 * since a changed encoding still round-trips against itself (GRYT-898). */

export { BACKUP_WORDS, seedToWords, wordsToSeed } from "@gryt/crypto";
