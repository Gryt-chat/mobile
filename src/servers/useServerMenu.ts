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
   * Open the channel permission templates for this server. Offered only where the
   * account holds `manage_roles`, which is what the server gates on.
   */
  onPermissions?: () => void;
  /**
   * Open the ban list. Offered on `view_bans`, deliberately not the permission that
   * lifts one — the screen hides the Unban button for them.
   */
  onBans?: () => void;
  /**
   * Hand this server's guest membership to the signed-in account. The by-hand route,
   * where **the person saying so is the consent and the only source of it**.
   */
  onClaim?: () => void;
}

/**
 * The long press on a server: the platform's own action sheet. The confirmation is a
 * second one rather than a Dialog — iOS drops a modal presented while another dismisses.
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
 * **Confirmed rather than done on the tap**, and after the interactions.
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
 * "Leave <server>?", once more, in red, with the address, since the servers likely to be
 * left are the ones you cannot tell apart. After the first sheet has gone, or it drops.
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
