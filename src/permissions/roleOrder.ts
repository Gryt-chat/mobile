/**
 * What the ranks become when a role moves up or down one place. Ported from the
 * desktop's `roleOrder.ts` — spaced rather than 1, 2, 3, so fewer rows rewrite.
 */

export interface RankedRole {
  id: string;
  rank: number;
}

/** The one role that never moves: the server refuses to save it. */
export const OWNER_ROLE = "owner";

/** Below the owner's 100, so a role can never tie with it. */
const TOP = 90;

/** Highest first. Ties broken by id, or two roles seeded at the same rank
    swap places between renders. */
export function byRank(roles: RankedRole[]): RankedRole[] {
  return [...roles].sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
}

/** Move one role to sit where another one is, and say which ranks changed. */
export function ranksAfterMove(roles: RankedRole[], activeId: string, overId: string): RankedRole[] {
  if (activeId === overId) return [];

  const movable = byRank(roles).filter((r) => r.id !== OWNER_ROLE);
  const from = movable.findIndex((r) => r.id === activeId);
  const to = movable.findIndex((r) => r.id === overId);
  if (from < 0 || to < 0) return [];

  const next = [...movable];
  next.splice(to, 0, ...next.splice(from, 1));

  const step = Math.max(1, Math.floor(TOP / (next.length + 1)));

  const changed: RankedRole[] = [];
  next.forEach((role, index) => {
    const rank = Math.max(1, TOP - index * step);
    if (rank !== role.rank) changed.push({ ...role, rank });
  });

  return changed;
}

/** One step up or down the ordered list, for the phone's up/down buttons rather
    than a drag. Null at either end. */
export function neighborId(roles: RankedRole[], id: string, direction: "up" | "down"): string | null {
  const ordered = byRank(roles).filter((r) => r.id !== OWNER_ROLE);
  const index = ordered.findIndex((r) => r.id === id);
  if (index < 0) return null;
  const target = direction === "up" ? index - 1 : index + 1;
  return ordered[target]?.id ?? null;
}
