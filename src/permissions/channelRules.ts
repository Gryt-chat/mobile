/**
 * The parts of the channel scope screen that are this app's alone. The matrix
 * moved to `@gryt/core`, where the two clients had quietly disagreed about how
 * a cell is keyed; what is left is wording and ordering.
 *
 * **`scopeChoiceFrom` is not the package's `scopeChoiceFromValue`** — this one
 * takes an id and a flag, that one a `<select>` value.
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
 * What a template does, in one line. **Reading is called out separately**: a
 * role denied `read_messages` is not shown a locked channel, the server stops
 * naming it at all, and somebody setting that deserves to know which of the two
 * they are doing.
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
 * A label for a permission the server named. **Falls back to the id rather than
 * hiding the row** — the save writes the whole matrix, so a dropped row would
 * quietly clear that rule.
 */
export function permissionLabel(permission: string): string {
  return PERMISSION_LABELS[permission] ?? permission;
}

// ── Which scope a channel is pointed at ──────────────────────────────

/**
 * The three answers a channel can give about its permissions: no scope, a named
 * scope shared with other channels, or this channel's own private one.
 *
 * **Both clients talk to `server:channels:scope:set`**, which takes them as
 * three shapes of one payload, so the two have to agree on which means what.
 */
export function scopeChoiceFrom(scopeId: string | null, isTemplate: boolean): ScopeChoice {
  if (!scopeId) return { kind: "everyone" };
  return isTemplate ? { kind: "template", templateId: scopeId } : { kind: "custom" };
}

/**
 * The payload for `server:channels:scope:set`. Only Custom carries rules — **a
 * template must not**, or editing one from a screen titled with a single
 * channel's name changes every other channel using it.
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
 * Kept here rather than taken from the package, which very nearly matches.
 * **The difference is the empty case**: this one is only reached for a *custom*
 * scope, where no rules means "Changes nothing yet", while the desktop's also
 * serves the everyone case and says something else entirely.
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
 * The warning shown before saving, or null. **Before, not after**: saving a
 * template changes every channel on it at once and the server evicts anybody in
 * a voice room they can no longer see, so afterwards there is nothing to say.
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
