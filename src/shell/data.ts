/* Fake data, so the shell has something to be a shell around.
 *
 * None of this is wired to a server. GRYT-398 is about the arrangement — where
 * the tab bar is, what the drawer holds, what the sheet holds — and that is
 * judged by looking at it.
 *
 * Every shape here is the one the desktop client already uses rather than an
 * invention, because the two clients talk to the same server and a shape made
 * up here would have to be unmade later. In particular `Status` is the
 * client's own `UserStatus` — four values, all derived from what you are doing
 * rather than picked from a menu. The desktop client has no manual presence
 * picker at all, so neither does this.
 */

export interface Server {
  id: string;
  name: string;
  /** Stands in for `icon_url`, which the client reads from server details. */
  initials: string;
  color: string;
  unread?: number;
}

export interface Channel {
  id: string;
  name: string;
  kind: "text" | "voice";
  unread?: number;
  /** Voice channels only: who is already in there. */
  inCall?: string[];
}

/** The client's `UserStatus`, verbatim. */
export type Status = "online" | "in_voice" | "afk" | "offline";

export const STATUS_LABEL: Record<Status, string> = {
  in_voice: "In Voice",
  online: "Online",
  afk: "AFK",
  offline: "Offline",
};

export const SERVERS: Server[] = [
  { id: "gryt", name: "Gryt", initials: "GR", color: "#4b5a7c", unread: 3 },
  { id: "hjemme", name: "Hjemme", initials: "HJ", color: "#3f5d52" },
  { id: "lan", name: "LAN-gjengen", initials: "LA", color: "#7c5a4b", unread: 12 },
  { id: "jobb", name: "Jobb", initials: "JO", color: "#5a4b7c" },
];

export const CHANNELS: Channel[] = [
  { id: "general", name: "general", kind: "text", unread: 3 },
  { id: "utvikling", name: "utvikling", kind: "text" },
  { id: "design", name: "design", kind: "text", unread: 1 },
  { id: "tilfeldig", name: "tilfeldig", kind: "text" },
  { id: "allmenn", name: "Allmenn", kind: "voice", inCall: ["Ingy", "Arne"] },
  { id: "spill", name: "Spill", kind: "voice" },
];

export const ME = {
  name: "Sivert",
  /** The copyable user id the settings "You" panel pins to the bottom. */
  userId: "8f2c-41ab-9d07",
  color: "#3f5d52",
};
