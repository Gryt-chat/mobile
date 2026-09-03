import type { Member, ServerInfoDetails } from "./types";

/**
 * The member list cut into role groups, the way the desktop client cuts it.
 *
 * Mobile grouped by presence — In voice, Around, Away, Offline — and that was a
 * deliberate answer to "who is about". The two clients answering the same
 * question differently is the more expensive thing: somebody moderating from a
 * phone is reading the same server they read on a desktop, and a list that
 * regroups itself between them is one they have to re-learn each time. So this
 * matches, rule for rule, and the presence answer is what the voice strip above
 * the list already gives.
 *
 * Three rules, and the third is the one worth stating: **offline leaves its
 * role.** Somebody who is not here is not usefully filed under Moderator, so
 * they go to one group at the end in one alphabet rather than to the bottom of
 * each role.
 *
 * Roles run highest rank first. Roles nobody holds are left out rather than
 * drawn empty, so a server with fifteen roles and four people online shows four
 * headings.
 *
 * A member whose role the server did not describe — an older server sending no
 * role list, or a role deleted while the drawer was open — lands in one unnamed
 * group after the named ones. That is also what the whole list looks like on a
 * server too old to send roles, which is the graceful version of this rather
 * than an empty drawer.
 */

/** The roles a server describes, as `server:details` sends them. */
export type RoleSummary = NonNullable<ServerInfoDetails["roles"]>[number];

export interface MemberGroup {
  key: string;
  title: string;
  /** The role's own colour, or null for a role without one and for the two
   *  groups that are not roles. */
  color: string | null;
  members: Member[];
}

const UNGROUPED_KEY = "__ungrouped__";
const OFFLINE_KEY = "__offline__";

function byName(a: Member, b: Member): number {
  return (a.nickname ?? "").localeCompare(b.nickname ?? "", undefined, {
    sensitivity: "base",
  });
}

export function groupMembersByRole(
  members: Member[],
  roles: RoleSummary[],
): MemberGroup[] {
  const byRank = [...roles].sort((a, b) => b.rank - a.rank);
  const known = new Set(roles.map((r) => r.id));

  const offline: Member[] = [];
  const present = new Map<string, Member[]>();

  for (const member of members) {
    /* Undefined counts as offline, the same as the desktop treats it: a server
     * that sent no status for somebody is not telling us they are here. */
    if (member.status === "offline" || member.status === undefined) {
      offline.push(member);
      continue;
    }

    const key = member.role && known.has(member.role) ? member.role : UNGROUPED_KEY;
    const bucket = present.get(key);
    if (bucket) bucket.push(member);
    else present.set(key, [member]);
  }

  const groups: MemberGroup[] = [];

  for (const role of byRank) {
    const held = present.get(role.id);
    if (!held?.length) continue;
    groups.push({
      key: role.id,
      title: role.name ?? role.id,
      color: role.color ?? null,
      members: held.sort(byName),
    });
  }

  const rest = present.get(UNGROUPED_KEY);
  if (rest?.length) {
    groups.push({
      key: UNGROUPED_KEY,
      // Named rather than blank: a heading with no words above a list of people
      // reads as a rendering fault.
      title: groups.length > 0 ? "Everyone else" : "Members",
      color: null,
      members: rest.sort(byName),
    });
  }

  if (offline.length) {
    groups.push({
      key: OFFLINE_KEY,
      title: "Offline",
      color: null,
      members: offline.sort(byName),
    });
  }

  return groups;
}
