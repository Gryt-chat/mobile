import type { Member, RichActivity } from "./types";

/**
 * The words under a member's name for what they're doing. Pure, so the phone's
 * wording can be tested apart from the row (GRYT-1310).
 */

const VERB: Record<RichActivity["type"], string> = {
  playing: "Playing",
  listening: "Listening to",
  watching: "Watching",
  competing: "Competing in",
};

/** "12 min", "1 h 5 min". Coarse, since a row isn't redrawn every second. */
export function elapsedShort(startedAt: number | undefined, now: number): string | null {
  if (startedAt === undefined || !Number.isFinite(startedAt) || startedAt > now) return null;
  const minutes = Math.floor((now - startedAt) / 60_000);
  if (minutes < 1) return "just started";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** The headline and the detail line, or null when they aren't doing anything. */
export function activityLines(member: Member, now: number): { headline: string; detail: string | null } | null {
  if (member.status === "offline") return null;
  const card = member.richActivity;
  if (card?.name) {
    const party = card.party ? (card.party.max ? `${card.party.size} of ${card.party.max}` : `${card.party.size} in party`) : null;
    const parts = [card.details, card.state, party, elapsedShort(card.startedAt, now)].filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    );
    return { headline: `${VERB[card.type] ?? VERB.playing} ${card.name}`, detail: parts.length ? parts.join(" · ") : null };
  }
  const text = member.activity?.trim();
  return text ? { headline: text, detail: null } : null;
}
