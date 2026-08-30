import type { SealDecision } from "@gryt/crypto";

/**
 * What to say above the composer when a conversation is not encrypted
 * (GRYT-729).
 *
 * Pure and in its own file so the wording has a test. It is the only thing that
 * tells somebody their message is going out in the open, and the failure mode
 * is not a crash — it is a sentence that is quietly wrong, or one that reads
 * like an accusation about a person who has done nothing but not updated their
 * app yet.
 *
 * The same three reasons and the same three phrasings as the desktop's
 * `ChatView`. Two clients describing one state differently is worse than either
 * wording.
 */
export function sealingNotice(
  decision: SealDecision,
  nameFor: (memberId: string) => string | undefined,
): string | null {
  // Drawn only when it is *not* encrypted. A conversation that seals is the
  // ordinary case once everybody has updated, and a permanent badge saying so
  // becomes furniture nobody reads — which is the state where it going missing
  // means nothing to anybody.
  if (decision.kind !== "plaintext") return null;
  if (decision.blockedBy.length === 0) return null;

  const parts = decision.blockedBy.map((blocked) => {
    const who = nameFor(blocked.memberId) ?? "somebody in this conversation";

    // "Changed" is deliberately not "somebody swapped their key". The two
    // reasons for one — a person restored a different seed, or a server
    // substituted a key — look identical from here, and only one of them is
    // anybody's doing.
    if (blocked.reason === "changed") return `${who}'s key changed`;
    if (blocked.reason === "unusable") return `${who}'s key did not check out`;
    // `no-key`, and anything the package adds later. A reason nobody has
    // written a sentence for still has to produce one, because the alternative
    // is a notice that quietly stops being drawn.
    return `${who} has not published a key`;
  });

  return `Not encrypted: ${parts.join(", ")}.`;
}
