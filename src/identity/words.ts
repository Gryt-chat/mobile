/* The identity as 24 words, encoded in `@gryt/crypto` against a fixed vector. Drifting
 * would not fail loudly: a changed encoding still round-trips against itself. */

export { BACKUP_WORDS, seedToWords, wordsToSeed } from "@gryt/crypto";

/** What saving the words writes: the words, then how to use them. */
export function recoveryKeyText(words: string): string {
  return [
    "Gryt recovery key",
    "",
    words.trim(),
    "",
    "These 24 words are your encryption key. On a new device, enter them in Gryt, or scan",
    "the code a device with your key shows in Settings.",
    "",
    "Keep this private. Anyone with these words can read your encrypted messages and act as you.",
  ].join("\n");
}
