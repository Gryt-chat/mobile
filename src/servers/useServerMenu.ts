import { useCallback } from "react";
import { ActionSheetIOS, InteractionManager, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";

import type { JoinedServer } from "./store";

export interface ServerMenuActions {
  server: JoinedServer;
  /** Offered only where you are not already looking at this server. */
  onSwitch?: () => void;
  /** Asks first. Leaving is not undoable without the invite. */
  onLeave: () => void;
  /**
   * Hand this server's guest membership to the signed-in account.
   *
   * Offered only where it is still on the table — signed in, and not already
   * agreed. This is the by-hand route the prompt cannot cover: a seed restored
   * onto a device that has never been to this server, where nothing local knows
   * there is anything to claim. The person saying so is the consent, and the
   * only source of it. GRYT-502.
   */
  onClaim?: () => void;
}

/**
 * The long press on a server: the system's own action sheet.
 *
 * Returns an `onLongPress` and nothing else, so the row it goes on keeps the
 * markup it already had. That is the whole design — the row is React Native and
 * stays React Native, and only the menu is the platform's.
 *
 * **This started as `@expo/ui`'s `ContextMenu`**, which is `UIContextMenu`
 * proper: the lift, the blur, the haptic. It is the better-looking answer and
 * it does not work here. The menu has to hang off a SwiftUI `Host`, the row
 * goes inside an `RNHostView`, and the row's width never survives the trip —
 * with `matchContents` SwiftUI measures the row with no width to work with, so
 * the `flex: 1` holding the server's name resolves to zero and the name
 * disappears; sizing the host from React Native instead left the row not
 * filling it and centred the icon. Two shapes, two ways of losing the name.
 *
 * `ActionSheetIOS` is also the system's, has a real destructive style, and
 * needs nothing hosted — which matters more than it might, because one of the
 * two places this is used is inside a drawer rendered through a portal.
 *
 * iOS only, and it says so: `ActionSheetIOS` does not exist on Android. The
 * long press is simply not offered there rather than falling back to something
 * that looks like it but is not. Android is not a target yet, and a menu is a
 * bad place to find that out.
 *
 * **The confirmation is a second action sheet, not a Dialog.** It was a Dialog,
 * mounted beside the tabs so that the switcher — which is a drawer, and a
 * React Native `Modal` — would not be asking from inside a portal. That is not
 * far enough: the drawer had to close for the dialog to be reachable, and iOS
 * drops a modal presented while another is still dismissing. From the switcher
 * the drawer closed, the confirmation never appeared, and the server was not
 * left. There was no way to leave a server from the list of them.
 *
 * An action sheet is a `UIAlertController` presented by UIKit rather than a
 * React Native modal, so it stacks over the drawer instead of fighting it —
 * which the menu itself already proved by opening over it.
 */
export function useServerMenu({ server, onSwitch, onLeave, onClaim }: ServerMenuActions) {
  return useCallback(() => {
    if (Platform.OS !== "ios") return;

    /* Built rather than declared, because the indices below are positions in
     * this array and a conditional entry moves them. */
    const options = [
      ...(onSwitch ? ["Switch to this server"] : []),
      ...(onClaim ? ["Use previous membership"] : []),
      "Copy address",
      `Leave ${server.name}`,
      "Cancel",
    ];
    const leave = options.length - 2;

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: server.name,
        message: server.host,
        options,
        destructiveButtonIndex: leave,
        cancelButtonIndex: options.length - 1,
        userInterfaceStyle: "dark",
      },
      (index) => {
        if (index === leave) confirmLeave(server, onLeave);
        else if (options[index] === "Copy address") void Clipboard.setStringAsync(server.host);
        else if (options[index] === "Switch to this server") onSwitch?.();
        else if (options[index] === "Use previous membership") confirmClaim(server, onClaim);
      },
    );
  }, [server, onSwitch, onLeave, onClaim]);
}

/**
 * "Use your previous membership here?", by hand.
 *
 * Confirmed rather than done on the tap, for the same reason the prompt asks
 * at all: signing the proof tells the server the account and the guest are the
 * same person, and nothing later takes that back. A menu entry is easy to hit
 * by accident; this one is not undoable.
 *
 * After the interactions, like the leave confirmation and for the same reason —
 * iOS drops a `UIAlertController` presented while another is dismissing.
 */
function confirmClaim(server: JoinedServer, onClaim?: () => void) {
  if (!onClaim) return;

  InteractionManager.runAfterInteractions(() => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Use your previous membership here?",
        message: `${server.name}\n\nIf you used this server before signing in, Gryt can attach that membership to your account — your roles, anything you own, and the history attached to it. Only do this if that was you; it cannot be undone.`,
        options: ["Use previous membership", "Cancel"],
        cancelButtonIndex: 1,
        userInterfaceStyle: "dark",
      },
      (index) => {
        if (index === 0) onClaim();
      },
    );
  });
}

/**
 * "Leave <server>?", once more, in red.
 *
 * Two deliberate actions to leave: hold the server, then answer this. Which is
 * the same shape the Dialog gave and without a second React Native modal in
 * the way.
 *
 * The address is in the message because the servers most likely to be left are
 * the ones you cannot tell apart by name — two dev servers, or one that moved.
 *
 * **After the first sheet has finished going away.** Presented straight from
 * the callback it is dropped: the menu is still dismissing, and iOS will not
 * present one `UIAlertController` over another on its way out. What that looks
 * like is a red Leave that does nothing at all, which is the same symptom the
 * Dialog had for a different reason.
 */
function confirmLeave(server: JoinedServer, onLeave: () => void) {
  InteractionManager.runAfterInteractions(() => {
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: `Leave ${server.name}?`,
      message: `${server.host}\n\nIt goes off your list. You will need an invite to come back, unless the server lets anyone join.`,
      options: ["Leave", "Cancel"],
      destructiveButtonIndex: 0,
      cancelButtonIndex: 1,
      userInterfaceStyle: "dark",
    },
      (index) => {
        if (index === 0) onLeave();
      },
    );
  });
}
