/**
 * The parts of the invites screen that touch neither a socket nor the clock, kept in
 * step with what `server:invites:create` and `server:invites:list` actually send.
 */

export interface InviteItem {
  code: string;
  createdAt?: string | Date;
  expiresAt?: string | Date | null;
  maxUses?: number;
  usesRemaining?: number;
  usesConsumed?: number;
  revoked?: boolean;
  note?: string | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isInviteItem(v: unknown): v is InviteItem {
  if (!isRecord(v)) return false;
  return typeof v.code === "string" && v.code.trim().length > 0;
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** "Never", "Expired", or a rounded "1d 3h" — the same units the desktop shows. */
export function formatExpiry(v: string | Date | null | undefined, now: number = Date.now()): string {
  const d = toDate(v);
  if (!d) return "Never";
  const diff = d.getTime() - now;
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}

/** "3 / 10", "∞", or "5" when the server did not send a cap. */
export function formatUses(remaining: number | undefined, max: number | undefined): string {
  const isInfinite = typeof max === "number" && max < 0;
  if (isInfinite) return "∞";
  if (remaining === undefined) return "?";
  if (typeof max === "number") return `${remaining} / ${max}`;
  return String(remaining);
}

/** The row's own summary: uses, expiry, and revoked — one line, the same order
    the desktop lists them in. */
export function inviteSummary(item: InviteItem, now: number = Date.now()): string {
  const isInfinite = typeof item.maxUses === "number" && item.maxUses < 0;
  const uses = isInfinite
    ? `${typeof item.usesConsumed === "number" ? item.usesConsumed : 0} / ∞`
    : formatUses(item.usesRemaining, item.maxUses);
  const expiry = formatExpiry(item.expiresAt, now);
  return `Uses: ${uses} · Expires: ${expiry}${item.revoked ? " · Revoked" : ""}`;
}

export interface DraftInvite {
  infiniteUses: boolean;
  maxUses: string;
  expiresInHours: string;
  note: string;
  customCode: string;
  grantsRole: string;
}

/** The payload for `server:invites:create`, minus `accessToken`. Mirrors the
    desktop's own clamps: 1 to 1000 uses, and a blank expiry means it never does. */
export function createInvitePayload(draft: DraftInvite): {
  infinite?: true;
  maxUses?: number;
  expiresInHours?: number;
  note: string | null;
  customCode: string | null;
  grantsRole: string | null;
} {
  const mu = Math.max(1, Math.min(1000, parseInt(draft.maxUses || "1", 10) || 1));
  const ehRaw = draft.expiresInHours.trim();
  const eh = ehRaw.length ? parseFloat(ehRaw) || 0 : undefined;
  const cc = draft.customCode.trim().toLowerCase();

  return {
    ...(draft.infiniteUses ? { infinite: true as const } : { maxUses: mu }),
    expiresInHours: typeof eh === "number" && eh > 0 ? eh : undefined,
    note: draft.note.trim().length ? draft.note.trim() : null,
    customCode: cc.length ? cc : null,
    grantsRole: draft.grantsRole || null,
  };
}

export const DEFAULT_DRAFT_INVITE: DraftInvite = {
  infiniteUses: false,
  maxUses: "1",
  expiresInHours: "",
  note: "",
  customCode: "",
  grantsRole: "",
};

/** Roles an invite may be bound to. Owner, admin and anything that hands out
    permissions are refused server-side; this is only what is worth offering. */
export function grantableRoles<T extends { id: string; name: string; grantableByInvite?: boolean }>(
  roles: T[],
): T[] {
  return roles.filter((r) => r.grantableByInvite);
}
