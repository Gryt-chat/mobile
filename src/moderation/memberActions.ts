import { moderationAbilities, type RoleDefinition } from "./moderationAbilities";

/**
 * What the long press on a member row offers, in order.
 *
 * Separate from the drawer because the risk here is not what it looks like,
 * it is the mapping. Which options exist depends on five independent answers,
 * and the sheet hands back the *index* of the one chosen — so an option that
 * appears or disappears shifts every index after it. Getting that wrong does
 * not look like a bug, it looks like banning somebody you meant to mute.
 *
 * So the label and the thing it does are built as one object and never
 * separated. The caller renders `label`s and runs `actions[index].run`.
 */

export type MemberActionKind =
  | "mute"
  | "unmute"
  | "deafen"
  | "undeafen"
  | "kick"
  | "ban"
  | "block"
  | "unblock";

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

  /* Moderator actions first, then blocking. Blocking is not moderation: anybody
     may do it, it needs no permission, and it changes only what you see. They
     share a sheet because they share a row. */
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

  return actions;
}

/** The indices to draw in the danger colour, for the sheet. */
export function dangerIndices(actions: readonly MemberAction[]): number[] {
  return actions.map((a, i) => (a.danger ? i : -1)).filter((i) => i >= 0);
}
