/**
 * What a ban is, beyond who (GRYT-836). **Pure so the mapping can be tested**:
 * a duration that turns into the wrong number of minutes is invisible on
 * screen, and looks like a ban that worked and quietly lifts a month early.
 */

export interface BanDuration {
  id: string;
  label: string;
  /** Null is permanent, which is what the server reads it as. */
  minutes: number | null;
}

/** The same five the desktop offers, in the same order. */
export const BAN_DURATIONS: readonly BanDuration[] = [
  { id: "1h", label: "1 hour", minutes: 60 },
  { id: "1d", label: "1 day", minutes: 1440 },
  { id: "7d", label: "7 days", minutes: 10080 },
  { id: "30d", label: "30 days", minutes: 43200 },
  { id: "permanent", label: "Permanent", minutes: null },
];

export const DEFAULT_DURATION = "permanent";

/** The reason is shown to the person banned, and the server caps it. */
export const REASON_MAX = 200;

export interface MemberInvite {
  targetServerUserId: string;
  /** Null when they did not arrive on one — a LAN join, an open server, the first member. */
  code: string | null;
  active: boolean;
  usesConsumed: number;
  maxUses: number;
}

export interface BanRequest {
  targetServerUserId: string;
  reason?: string;
  expiresInMinutes: number | null;
  deleteContent: boolean;
  revokeInvite: boolean;
}

export function minutesFor(durationId: string): number | null {
  return BAN_DURATIONS.find((d) => d.id === durationId)?.minutes ?? null;
}

/**
 * Whether to offer revoking the invite they came in on — only when there is a
 * live one. Banning somebody who arrived on a still-open invite achieves less
 * than it looks: an identity costs nothing to replace, so they return on a new
 * key with the same code.
 */
export function canRevokeInvite(invite: MemberInvite | null | undefined): boolean {
  return !!invite?.code && invite.active === true;
}

/**
 * What the server is told. `reason` is dropped rather than sent empty, since
 * the server shows the banned person something different for each.
 * **`revokeInvite` is forced false with no live invite**, so a toggle left on
 * from a previous member cannot revoke something unrelated.
 */
export function buildBanRequest({
  targetServerUserId,
  reason,
  durationId,
  deleteContent,
  revokeInvite,
  invite,
}: {
  targetServerUserId: string;
  reason: string;
  durationId: string;
  deleteContent: boolean;
  revokeInvite: boolean;
  invite: MemberInvite | null | undefined;
}): BanRequest {
  const trimmed = reason.trim().slice(0, REASON_MAX);
  return {
    targetServerUserId,
    reason: trimmed || undefined,
    expiresInMinutes: minutesFor(durationId),
    deleteContent,
    revokeInvite: revokeInvite && canRevokeInvite(invite),
  };
}

/**
 * How much of the invite has been spent. **Usage only** — whether it is open is
 * the caller's to say, since the row is only drawn for an open one.
 */
export function describeInvite(invite: MemberInvite): string {
  if (invite.maxUses > 0) return `${invite.usesConsumed} of ${invite.maxUses} used`;
  return `used ${invite.usesConsumed} times`;
}
