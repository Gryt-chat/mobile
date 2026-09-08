/**
 * What a moderator may do to somebody, on this server. **Rank decides who may be acted
 * on; the permission decides what the act is** — a four-rung ladder cannot say that.
 * **The server enforces all of it**; this decides what to offer.
 */

/** A role as the server defines it, from `server:roles:definitions`. */
export interface RoleDefinition {
  id: string;
  name?: string;
  rank: number;
}

/**
 * The ranks the built-in roles ship with, for a server that has not said otherwise.
 * Same numbers as the web client's `BUILT_IN_RANK`.
 */
export const BUILT_IN_RANK: Record<string, number> = {
  owner: 100,
  admin: 80,
  mod: 60,
  member: 40,
  guest: 10,
};

export interface ModerationAbilities {
  canMute: boolean;
  canDeafen: boolean;
  canKick: boolean;
  canBan: boolean;
  /** Whether to show the moderator block of the sheet at all. */
  any: boolean;
}

export function rankOf(
  roleId: string | null | undefined,
  roles: readonly RoleDefinition[],
): number {
  if (!roleId) return -1;
  const defined = roles.find((r) => r.id === roleId);
  if (defined) return defined.rank;
  return BUILT_IN_RANK[roleId] ?? -1;
}

/**
 * Whether `myRole` sits above `targetRole`. **False when either side is unknown**,
 * which hides an action rather than offering one that would be refused.
 */
export function outranks(
  myRole: string | null | undefined,
  targetRole: string | null | undefined,
  roles: readonly RoleDefinition[],
): boolean {
  if (!myRole || !targetRole) return false;
  return rankOf(myRole, roles) > rankOf(targetRole, roles);
}

export function moderationAbilities({
  myRole,
  targetRole,
  roles,
  can,
}: {
  myRole: string | null | undefined;
  targetRole: string | null | undefined;
  roles: readonly RoleDefinition[];
  /** `canOnServer` bound to this server's info. */
  can: (permission: string) => boolean;
}): ModerationAbilities {
  const above = outranks(myRole, targetRole, roles);

  const canMute = above && can("mute_members");
  /* The web client gates deafen on `deafen_members`, which is not in the pre-catalogue
   * list this app ships — so on an old server `canOnServer` offers it. The deliberate
   * direction: the server refuses if it disagrees. */
  const canDeafen = above && can("deafen_members");
  const canKick = above && can("kick_members");
  const canBan = above && can("ban_members");

  return {
    canMute,
    canDeafen,
    canKick,
    canBan,
    any: canMute || canDeafen || canKick || canBan,
  };
}
