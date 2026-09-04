/* The identity as 24 words. The encoding moved to `@gryt/crypto` (GRYT-898),
 * which pins it to a fixed vector — **this is the one duplicate where drifting
 * would not fail loudly**, since a changed encoding still round-trips against
 * itself and strands every phrase already written down.
 *
 * Re-exported so `IdentityScreen` and the tests do not have to move.
 */

export { BACKUP_WORDS, seedToWords, wordsToSeed } from "@gryt/crypto";
