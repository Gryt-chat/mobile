/**
 * The parts of the channel scope screen that are this app's alone.
 *
 * The matrix itself — rules in, grid out, and back — moved to `@gryt/core`,
 * because the desktop had the same thing and the two had quietly disagreed
 * about how a cell is keyed. What is left here is the wording and the ordering
 * this screen needs and the desktop does not.
 *
 * `scopeChoiceFrom` looks like the package's `scopeChoiceFromValue` and is not
 * the same function: this one takes an id and a flag, that one takes the value
 * out of a `<select>`. Neither app has the other's, so neither moved.
 */

export {
  cellState,
  indexRules,
  nextCellState,
  scopeSetPayload,
  withCell,
  type CellState,
  type ChannelRule,
  type RuleEffect,
  type ScopeChoice,
} from "@gryt/core";

import type { ChannelRule, ScopeChoice } from "@gryt/core";

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

// ── Which scope a channel is pointed at ──────────────────────────────

/**
 * The three answers a channel can give about its permissions.
 *
 * `everyone` is no scope at all. `template` is a named scope shared with other
 * channels, so editing it there changes them too. `custom` is this channel's
 * own private scope, which nothing else reads.
 *
 * The web client models the same three in
 * `packages/client/src/packages/settings/src/channelPermissionRules.ts`. Both
 * talk to `server:channels:scope:set`, which takes them as three shapes of one
 * payload, so the two have to agree on which shape means what.
 */
export function scopeChoiceFrom(scopeId: string | null, isTemplate: boolean): ScopeChoice {
  if (!scopeId) return { kind: "everyone" };
  return isTemplate ? { kind: "template", templateId: scopeId } : { kind: "custom" };
}

/**
 * The payload for `server:channels:scope:set`.
 *
 * Only Custom carries rules. **A template must not**, and that is the one worth
 * being careful about: editing a template's rules from a screen titled with one
 * channel's name would change every other channel using it, which is the
 * opposite of what anybody expects from that screen. Templates are edited in
 * the templates screen, where the channel count is on the row.
 */
export function sameChoice(a: ScopeChoice, b: ScopeChoice): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "template" && b.kind === "template") return a.templateId === b.templateId;
  return true;
}

/**
 * What this channel's permissions do, in one line, for the row under the title.
 *
 * Reading is called out separately for the reason it always is here: denying
 * `read_messages` does not grey the channel out, it removes it — the server
 * stops naming the channel at all.
 */
/**
 * Kept here rather than taken from the package, though the desktop has one of
 * these too and it very nearly matches.
 *
 * The difference is the empty case. This one is reached from `describeChoice`
 * below, only for a *custom* scope, where no rules yet means "Changes nothing
 * yet." The desktop calls the same function for the everyone case as well, so
 * its empty string is "Everyone on the server can see and use this channel."
 * Sharing it would put that sentence under a custom scope, where it is wrong,
 * and next to `describeChoice`'s own copy of it, where it is also duplicated.
 *
 * Same name on both sides, same shape, different job. Worth unpicking, and not
 * by moving the file.
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

export function describeChoice(
  choice: ScopeChoice,
  templateName: string | null,
  rules: ChannelRule[],
  roleNames: Map<string, string>,
): string {
  if (choice.kind === "everyone") return "Everyone on the server can see and use this channel.";
  if (choice.kind === "template") {
    return templateName
      ? `Follows the ${templateName} template. Changing it there changes every channel on it.`
      : "Follows a template.";
  }
  return describeRules(rules, roleNames);
}
