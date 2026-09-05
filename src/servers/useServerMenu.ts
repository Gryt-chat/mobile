import { useCallback } from "react";
import { InteractionManager } from "react-native";
import * as Clipboard from "expo-clipboard";

import { useActionSheet, type ActionSheetOptions } from "../ui/actionSheet";
import type { JoinedServer } from "./store";

export interface ServerMenuActions {
  server: JoinedServer;
  /** Offered only where you are not already looking at this server. */
  onSwitch?: () => void;
  /** Asks first. Leaving is not undoable without the invite. */
  onLeave: () => void;
  /**
   * Open the channel permission templates for this server.
   *
   * Offered only where the account holds `manage_roles`, which is what the
   * server gates the template events on. The caller decides — it is the one
   * holding the connection whose details say what this account can do.
   */
  onPermissions?: () => void;
  /**
   * Open the ban list for this server.
   *
   * Offered on `view_bans`, which is deliberately not the permission that
   * lifts one — somebody can be trusted to see who was banned and why without
   * being able to undo it. The screen hides the Unban button for them.
   */
  onBans?: () => void;
  /**
   * Hand this server's guest membership to the signed-in account. The by-hand
   * route the prompt cannot cover: a seed restored onto a device that has never
   * been here, where **the person saying so is the consent and the only source
   * of it** (GRYT-502).
   */
  onClaim?: () => void;
}

/**
 * The long press on a server: the platform's own action sheet. Returns an
 * `onLongPress` and nothing else, so the row keeps the markup it had.
 *
 * **The confirmation is a second action sheet, not a Dialog.** A Dialog needs
 * the drawer to close first, and iOS drops a modal presented while another is
 * still dismissing — so from the switcher the confirmation never appeared and
 * there was no way to leave a server from the list of them.
 *
 * **This whole file did nothing on Android until GRYT-560**, where the
 * `ActionSheetIOS` guard was a bare `return`.
 */
export function useServerMenu({ server, onSwitch, onLeave, onClaim, onPermissions, onBans }: ServerMenuActions) {
  const present = useActionSheet();

  return useCallback(() => {
    /* Built rather than declared, because the indices below are positions in
     * this array and a conditional entry moves them. */
    const options = [
      ...(onSwitch ? ["Switch to this server"] : []),
      ...(onClaim ? ["Convert my old user"] : []),
      ...(onPermissions ? ["Channel permissions"] : []),
      ...(onBans ? ["Banned people"] : []),
      "Copy address",
      `Leave ${server.name}`,
      "Cancel",
    ];
    const leave = options.length - 2;

    void present({
      title: server.name,
      message: server.host,
      options,
      destructiveButtonIndex: leave,
      cancelButtonIndex: options.length - 1,
    }).then((index) => {
      if (index === leave) confirmLeave(present, server, onLeave);
      else if (options[index] === "Copy address") void Clipboard.setStringAsync(server.host);
      else if (options[index] === "Switch to this server") onSwitch?.();
      else if (options[index] === "Convert my old user") confirmClaim(present, server, onClaim);
      else if (options[index] === "Channel permissions") onPermissions?.();
      else if (options[index] === "Banned people") onBans?.();
    });
  }, [present, server, onSwitch, onLeave, onClaim, onPermissions, onBans]);
}

type Present = (options: ActionSheetOptions) => Promise<number>;

/**
 * The same question by hand, for a device whose guest history cannot answer it.
 * **Confirmed rather than done on the tap**: signing the proof tells the server
 * the account and the guest are the same person, and nothing takes that back.
 *
 * After the interactions, or iOS drops a `UIAlertController` presented while
 * another is dismissing.
 */
function confirmClaim(present: Present, server: JoinedServer, onClaim?: () => void) {
  if (!onClaim) return;

  InteractionManager.runAfterInteractions(() => {
    void present({
      title: "Convert your old user on this server?",
      message: `${server.name}\n\nIf you used this server as a guest before signing in, that user can become your account here, with its roles, anything it owns and its history.\n\nOnly do this if that user was you. You can't undo it.`,
      options: ["Yes, convert my user", "Cancel"],
      cancelButtonIndex: 1,
    }).then((index) => {
      if (index === 0) onClaim();
    });
  });
}

/**
 * "Leave <server>?", once more, in red.
 *
 * The address is in the message because the servers most likely to be left are
 * the ones you cannot tell apart by name — two dev servers, or one that moved.
 *
 * **After the first sheet has finished going away.** Presented straight from
 * the callback it is dropped: the menu is still dismissing, and iOS will not
 * present one `UIAlertController` over another on its way out. What that looks
 * like is a red Leave that does nothing at all.
 */
function confirmLeave(present: Present, server: JoinedServer, onLeave: () => void) {
  InteractionManager.runAfterInteractions(() => {
    void present({
      title: `Leave ${server.name}?`,
      message: `${server.host}\n\nIt goes off your list. You will need an invite to come back, unless the server lets anyone join.`,
      options: ["Leave", "Cancel"],
      destructiveButtonIndex: 0,
      cancelButtonIndex: 1,
    }).then((index) => {
      if (index === 0) onLeave();
    });
  });
}
