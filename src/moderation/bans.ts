/**
 * The ban list, as rows to draw.
 *
 * Split out from the screen because everything interesting here is a decision
 * about what a row says, and none of it needs React: a ban carries five fields
 * and four of them can be missing.
 *
 * **A ban is keyed on the account, not the membership.** `grytUserId` is the
 * only field always present — the nickname comes from a `LEFT JOIN` against a
 * members row that a banned person may no longer have, and the moderator's
 * name from another that may belong to somebody who has since left. Both are
 * null in normal use rather than exceptionally.
 */

export interface BanRecord {
  gryt_user_id: string;
  banned_by_server_user_id: string;
  reason: string | null;
  created_at: string;
  expires_at: string | null;
  nickname: string | null;
  banned_by_nickname: string | null;
}

export interface BanRow {
  grytUserId: string;
  /** What to put on the first line. */
  title: string;
  /** Whether `title` is a real name or a stand-in, so it can be drawn dimmer. */
  named: boolean;
  reason: string | null;
  /** "Permanent", or when it lifts itself. */
  duration: string;
  /** "Banned by X on <date>", or the date alone when nobody is named. */
  attribution: string;
}

/**
 * A name, or something honest in its place.
 *
 * Not "Unknown": the server does know who this is, it is an account with no
 * membership row left. Showing a shortened subject says that, and is also the
 * only thing a moderator could match against another record.
 */
export function displayName(ban: BanRecord): { title: string; named: boolean } {
  const nickname = ban.nickname?.trim();
  if (nickname) return { title: nickname, named: true };
  const id = ban.gryt_user_id ?? "";
  const short = id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
  return { title: short || "Someone", named: false };
}

function day(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * How long it lasts.
 *
 * An expiry in the past should not be here at all — the server deletes those
 * on read — so one that arrives anyway is stale data rather than an expired
 * ban, and saying "expired" would invite somebody to lift a ban that is
 * already gone. It says the date and lets the reader decide.
 */
export function describeDuration(ban: BanRecord): string {
  const until = day(ban.expires_at);
  return until ? `Until ${until}` : "Permanent";
}

export function describeAttribution(ban: BanRecord): string {
  const on = day(ban.created_at);
  const by = ban.banned_by_nickname?.trim();
  if (by && on) return `Banned by ${by} on ${on}`;
  if (by) return `Banned by ${by}`;
  if (on) return `Banned on ${on}`;
  return "Banned";
}

export function toRows(bans: readonly BanRecord[]): BanRow[] {
  return bans.map((ban) => {
    const { title, named } = displayName(ban);
    return {
      grytUserId: ban.gryt_user_id,
      title,
      named,
      reason: ban.reason?.trim() || null,
      duration: describeDuration(ban),
      attribution: describeAttribution(ban),
    };
  });
}
