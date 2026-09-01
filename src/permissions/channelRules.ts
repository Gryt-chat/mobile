/**
 * The rules on a channel permission scope, as a matrix and back again.
 *
 * Pure, and importing nothing from react-native, so vitest can run it. Same
 * reason every tested module in `src/account` is pure: pulling in a component
 * pulls in react-native, whose Flow syntax vitest cannot parse.
 *
 * The server stores one row per thing a scope changes. Inherit is the *absence*
 * of a row, so a cell has three states and only two of them are ever written.
 * That asymmetry is where the mistakes live, which is why this is a file of its
 * own rather than state inside the screen.
 *
 * The web client has the same logic in
 * `packages/client/src/packages/settings/src/channelPermissionRules.ts`. Both
 * talk to `server:permissions:template:save`, which replaces the whole rule set
 * with what it is sent, so the two have to agree on what an empty list means.
 */

export type RuleEffect = "allow" | "deny";

/** What one cell is showing. */
export type CellState = "inherit" | RuleEffect;

export interface ChannelRule {
  roleId: string;
  permission: string;
  effect: RuleEffect;
}

/** Look up one cell without scanning the whole list per cell. */
export function indexRules(rules: ChannelRule[]): Map<string, RuleEffect> {
  const byCell = new Map<string, RuleEffect>();
  for (const rule of rules) byCell.set(`${rule.roleId} ${rule.permission}`, rule.effect);
  return byCell;
}

export function cellState(
  index: Map<string, RuleEffect>,
  roleId: string,
  permission: string,
): CellState {
  return index.get(`${roleId} ${permission}`) ?? "inherit";
}

/**
 * The next state when somebody taps a cell.
 *
 * inherit to deny to allow and back. Deny first, matching the web client:
 * taking something away is what people open this to do, so the dangerous state
 * is one tap from neutral rather than two.
 */
export function nextCellState(current: CellState): CellState {
  if (current === "inherit") return "deny";
  if (current === "deny") return "allow";
  return "inherit";
}

/** Set one cell, dropping the row entirely when it goes back to inherit. */
export function withCell(
  rules: ChannelRule[],
  roleId: string,
  permission: string,
  state: CellState,
): ChannelRule[] {
  const without = rules.filter((r) => !(r.roleId === roleId && r.permission === permission));
  if (state === "inherit") return without;
  return [...without, { roleId, permission, effect: state }];
}

/**
 * Low rank first.
 *
 * The same order the web matrix puts its columns in, so somebody who set a
 * template up on the desktop finds the roles where they left them. It runs from
 * the people a channel is usually being closed to towards the people it is
 * being kept open for.
 */
export function orderRoles<T extends { rank: number }>(roles: T[]): T[] {
  return [...roles].sort((a, b) => a.rank - b.rank);
}

/**
 * What a template does, in one line, for the row in the list.
 *
 * Reading is called out separately because its consequence is different in
 * kind. A role denied `read_messages` is not shown a locked channel — the
 * server stops naming the channel at all, and asking for it by id answers what
 * a channel that does not exist answers. Somebody setting that deserves to be
 * told which of the two they are doing.
 */
export function describeRules(rules: ChannelRule[], roleNames: Map<string, string>): string {
  if (rules.length === 0) return "Changes nothing yet.";

  const hidden = rules
    .filter((r) => r.permission === "read_messages" && r.effect === "deny")
    .map((r) => roleNames.get(r.roleId) ?? r.roleId);

  const others = rules.filter((r) => r.permission !== "read_messages").length;

  if (hidden.length === 0) {
    return `${others} change${others === 1 ? "" : "s"} to what roles can do.`;
  }

  const list =
    hidden.length === 1
      ? hidden[0]
      : `${hidden.slice(0, -1).join(", ")} and ${hidden[hidden.length - 1]}`;
  const rest = others > 0 ? `, and ${others} other change${others === 1 ? "" : "s"}` : "";
  return `${list} cannot see the channel at all${rest}.`;
}

/**
 * The warning shown before saving, or null when there is nothing to warn about.
 *
 * Before, not after. Saving a template changes every channel on it at once, and
 * the server evicts anybody sitting in a voice room they can no longer see —
 * so by the time the save lands, the people it affects have already been
 * removed. There is nothing useful to tell them afterwards.
 */
export function describeSaveImpact(channelCount: number): string | null {
  if (channelCount <= 0) return null;
  return `Saving changes ${channelCount} channel${channelCount === 1 ? "" : "s"}. Anyone who loses access to one is removed from its voice room.`;
}

/**
 * The warning before deleting a template.
 *
 * Deleting puts every channel using it back to inheriting, which can only
 * widen access — nobody is thrown out. So this names the count without the
 * eviction line, because saying somebody might be removed would be false.
 */
export function describeDeleteImpact(channelCount: number): string {
  if (channelCount <= 0) return "No channel is using this template.";
  return `${channelCount} channel${channelCount === 1 ? "" : "s"} will go back to being open to everyone.`;
}

/** Human labels for the permissions a scope can change, in the server's order. */
const PERMISSION_LABELS: Record<string, string> = {
  read_messages: "Read messages",
  send_messages: "Send messages",
  edit_own_messages: "Edit own messages",
  delete_own_messages: "Delete own messages",
  attach_files: "Attach files",
  add_reactions: "Add reactions",
  report_messages: "Report messages",
  use_link_previews: "See link previews",
  manage_messages: "Manage messages",
  join_voice: "Join voice",
  speak: "Speak",
  share_video: "Share video",
  share_screen: "Share screen",
};

/**
 * A label for a permission the server named.
 *
 * Falls back to the id rather than hiding the row. The server sends the list,
 * so a build older than a permission will meet one it has no label for — and
 * an unlabelled row somebody can still set beats a row that silently is not
 * there, because the save writes the whole matrix and a dropped row would
 * quietly clear that rule.
 */
export function permissionLabel(permission: string): string {
  return PERMISSION_LABELS[permission] ?? permission;
}
