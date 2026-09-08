import { moderationAbilities, type RoleDefinition } from "./moderationAbilities";

/**
 * What the long press on a member row offers, in order. The sheet hands back the index
 * and five answers decide which options exist, so label and action are one object.
 */

export type MemberActionKind =
  | "mute"
  | "unmute"
  | "deafen"
  | "undeafen"
  | "kick"
  | "ban"
  | "block"
  | "unblock"
  | "report";

export interface MemberAction {
  kind: MemberActionKind;
  label: string;
  /** Drawn in the danger colour, and worth a confirmation. */
  danger: boolean;
}

export function memberActions({
  name,
  myRole,
  targetRole,
  roles,
  can,
  isServerMuted = false,
  isServerDeafened = false,
  isBlocked = false,
}: {
  name: string;
  myRole: string | null | undefined;
  targetRole: string | null | undefined;
  roles: readonly RoleDefinition[];
  can: (permission: string) => boolean;
  isServerMuted?: boolean;
  isServerDeafened?: boolean;
  isBlocked?: boolean;
}): MemberAction[] {
  const may = moderationAbilities({ myRole, targetRole, roles, can });
  const actions: MemberAction[] = [];

  /* Moderator actions first, then blocking. Blocking is not moderation: anybody may do
     it, and it changes only what you see. They share a sheet because they share a row. */
  if (may.canMute) {
    actions.push(
      isServerMuted
        ? { kind: "unmute", label: `Unmute ${name}`, danger: false }
        : { kind: "mute", label: `Mute ${name} for everyone`, danger: false },
    );
  }

  if (may.canDeafen) {
    actions.push(
      isServerDeafened
        ? { kind: "undeafen", label: `Undeafen ${name}`, danger: false }
        : { kind: "deafen", label: `Deafen ${name}`, danger: false },
    );
  }

  if (may.canKick) actions.push({ kind: "kick", label: `Kick ${name}`, danger: true });
  if (may.canBan) actions.push({ kind: "ban", label: `Ban ${name}`, danger: true });

  actions.push(
    isBlocked
      ? { kind: "unblock", label: `Unblock ${name}`, danger: false }
      : { kind: "block", label: `Block ${name}`, danger: true },
  );

  /* Last, and beside blocking rather than among the moderator actions: reporting asks
     for `report_messages`, which every member holds, and has no rank check. */
  if (can("report_messages")) {
    actions.push({ kind: "report", label: `Report ${name}`, danger: true });
  }

  return actions;
}

/** The indices to draw in the danger colour, for the sheet. */
export function dangerIndices(actions: readonly MemberAction[]): number[] {
  return actions.map((a, i) => (a.danger ? i : -1)).filter((i) => i >= 0);
}
