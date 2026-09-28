import { useCallback } from "react";
import { InteractionManager } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useToast } from "@gryt/ui-native";

import { useActionSheet, type ActionSheetOptions } from "../ui/actionSheet";
import { inviteLink, isPublicHost } from "./address";
import { useServerJoinPolicy } from "./joinPolicy";
import { setSuppressEveryone, useSuppressEveryone } from "../notify/suppressEveryone";
import type { JoinedServer } from "./store";
import { useContactPrefs } from "../connection/contactPrefs";
import { useOptionalConnections } from "../connection/ConnectionsProvider";
import { totalFor } from "../connection/mentions";
import { readServer, serverTotal, useUnread } from "../connection/unread";
import { CALLS_TITLE, MESSAGES_TITLE, pickContactRule } from "../preferences/pickContactRule";
import { pickNotificationLevel } from "../preferences/pickNotificationLevel";
import { threadUnreadIn, useThreadUnread } from "../threads/threadUnread";

export const NO_PUBLIC_ADDRESS = "This server has no public address, so there's no link to copy.";

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
   * Open Server settings — invites, folders, emojis and roles. Offered where any of
   * those sections would have something to show, same as the desktop's own gate.
   */
  onServerSettings?: () => void;
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
export function useServerMenu({
  server,
  onSwitch,
  onLeave,
  onClaim,
  onPermissions,
  onBans,
  onServerSettings,
}: ServerMenuActions) {
  const present = useActionSheet();
  const toast = useToast();
  /* Everyone's, not just managers': on a server anyone can join, sharing it gives
   * nothing away. Only once the server has said so, over `server:info`. */
  const shareable = useServerJoinPolicy(server.host) === "open";
  /* Per server and per device. Saved the moment it is picked, like every setting. */
  const suppressed = useSuppressEveryone(server.host);
  const suppressLabel = suppressed ? "Allow @everyone and @here" : "Suppress @everyone and @here";
  const contactPrefs = useContactPrefs();
  /* Offered only with something to read, where the desktop greys it out instead. */
  const connections = useOptionalConnections();
  const waiting =
    serverTotal(useUnread(), server.host) +
    threadUnreadIn(useThreadUnread(), server.host) +
    totalFor(connections?.mentions ?? {}, server.host);
  const socket = connections?.byHost[server.host]?.socket;

  return useCallback(() => {
    /* Built rather than declared, because the indices below are positions in
     * this array and a conditional entry moves them. */
    const options = [
      ...(onSwitch ? ["Switch to this server"] : []),
      ...(onClaim ? ["Convert my old user"] : []),
      ...(onPermissions ? ["Channel permissions"] : []),
      ...(onBans ? ["Banned people"] : []),
      ...(onServerSettings ? ["Server settings"] : []),
      ...(shareable ? ["Copy invite link"] : []),
      suppressLabel,
      ...(waiting > 0 ? [MARK_READ] : []),
      NOTIFICATIONS_TITLE,
      MESSAGES_TITLE,
      CALLS_TITLE,
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
      else if (options[index] === "Copy invite link") copyInviteLink(server.host, toast);
      else if (options[index] === "Switch to this server") onSwitch?.();
      else if (options[index] === "Convert my old user") confirmClaim(present, server, onClaim);
      else if (options[index] === "Channel permissions") onPermissions?.();
      else if (options[index] === "Banned people") onBans?.();
      else if (options[index] === "Server settings") onServerSettings?.();
      else if (options[index] === suppressLabel) setSuppressEveryone(server.host, !suppressed);
      else if (options[index] === MARK_READ) readServer(socket, server.host);
      else if (options[index] === NOTIFICATIONS_TITLE) {
        pickNotificationLevel(present, server.host, { kind: "server" }, NOTIFICATIONS_TITLE, server.name, "all");
      } else if (options[index] === MESSAGES_TITLE) pickContactRule(present, server, "messages", contactPrefs);
      else if (options[index] === CALLS_TITLE) pickContactRule(present, server, "calls", contactPrefs);
    });
  }, [
    present,
    toast,
    shareable,
    suppressed,
    suppressLabel,
    waiting,
    socket,
    contactPrefs,
    server,
    onSwitch,
    onLeave,
    onClaim,
    onPermissions,
    onBans,
    onServerSettings,
  ]);
}

type Present = (options: ActionSheetOptions) => Promise<number>;

const MARK_READ = "Mark as read";
const NOTIFICATIONS_TITLE = "Notifications";

/**
 * The host-only link (GRYT-1291), named by an address that works from another network.
 * A LAN or loopback address points at whoever opens it, so those get no link at all.
 */
function copyInviteLink(host: string, toast: ReturnType<typeof useToast>) {
  if (!isPublicHost(host)) {
    toast.show({ title: NO_PUBLIC_ADDRESS, severity: "error", duration: 7000 });
    return;
  }
  void Clipboard.setStringAsync(inviteLink(host)).then(
    () => toast.show({ title: "Copied invite link", severity: "success" }),
    () => toast.show({ title: "Could not copy the link", severity: "error" }),
  );
}

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
