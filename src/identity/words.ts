/* The identity as 24 words.
 *
 * The encoding moved to `@gryt/crypto` (GRYT-898). This file and the desktop's
 * agreed — same wordlist, same BIP-39 calls, same 24 — but they agreed by being
 * kept in step by hand, and this is the one duplicate where drifting would not
 * fail loudly: a changed encoding still round-trips against itself and strands
 * every phrase already written down. Crypto pins it to a fixed vector now.
 *
 * Re-exported so `IdentityScreen` and the tests do not have to move.
 */

export { BACKUP_WORDS, seedToWords, wordsToSeed } from "@gryt/crypto";
