import type { SealDecision } from "@gryt/crypto";

/**
 * What to say above the composer when a conversation is not encrypted. Pure, so the
 * wording has a test: the failure is a sentence that is quietly wrong, or one that
 * reads like an accusation. The same three phrasings as the desktop (GRYT-729).
 */
export function sealingNotice(
  decision: SealDecision,
  nameFor: (memberId: string) => string | undefined,
): string | null {
  // Drawn only when it is *not* encrypted. A permanent badge saying it is becomes
  // furniture nobody reads, which is the state where it going missing means nothing.
  if (decision.kind !== "plaintext") return null;
  if (decision.blockedBy.length === 0) return null;

  const parts = decision.blockedBy.map((blocked) => {
    const who = nameFor(blocked.memberId) ?? "somebody in this conversation";

    // "Changed" is deliberately not "somebody swapped their key": a restored seed and a
    // substituted key look identical from here, and only one is anybody's doing.
    if (blocked.reason === "changed") return `${who}'s key changed`;
    if (blocked.reason === "unusable") return `${who}'s key did not check out`;
    // `no-key`, and anything the package adds later. A reason nobody has written a
    // sentence for still has to produce one, or the notice stops being drawn.
    return `${who} has not published a key`;
  });

  return `Not encrypted: ${parts.join(", ")}.`;
}
