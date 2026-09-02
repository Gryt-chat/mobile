/**
 * What a ban is, beyond who.
 *
 * The phone could only send the desktop's defaults — permanent, delete their
 * messages, keep the invite — because the four choices needed a form and the
 * first pass did not have one. GRYT-836.
 *
 * Pure so the mapping can be tested. A duration that turns into the wrong
 * number of minutes is not visible on screen: it looks like a ban that worked
 * and quietly lifts a month early.
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
 * Whether to offer revoking the invite they came in on.
 *
 * Only when there is a live one to close. Banning somebody who arrived on a
 * still-open invite achieves less than it looks — an identity with no account
 * behind it costs nothing to replace, so they return on a new key with the
 * same code. A spent or already-revoked invite is not worth a row: there is
 * nothing left to close.
 */
export function canRevokeInvite(invite: MemberInvite | null | undefined): boolean {
  return !!invite?.code && invite.active === true;
}

/**
 * What the server is told.
 *
 * `reason` is dropped rather than sent empty, matching the desktop — the
 * server treats an absent reason and a blank one differently in what the
 * banned person is shown.
 *
 * `revokeInvite` is forced false when there is no live invite, so a toggle
 * left on from a previous member cannot revoke something unrelated.
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
 * How much of the invite has been spent: "3 of 10 used", or "used 41 times"
 * for one with no limit.
 *
 * Usage only. Whether it is open is the caller's to say, because the row this
 * appears in is only drawn for an open one — saying "still open" there as well
 * would be telling the reader something the row already implies.
 */
export function describeInvite(invite: MemberInvite): string {
  if (invite.maxUses > 0) return `${invite.usesConsumed} of ${invite.maxUses} used`;
  return `used ${invite.usesConsumed} times`;
}
