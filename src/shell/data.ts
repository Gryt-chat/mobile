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
  /** The server's own colour. The header band is painted from it. */
  color: string;
  /** What the client calls `host` — the address you joined at. */
  host: string;
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
  { id: "gryt", name: "Gryt", initials: "GR", color: "#2f4858", host: "gryt.chat", unread: 3 },
  { id: "hjemme", name: "Hjemme", initials: "HJ", color: "#2e4b3d", host: "hjemme.lan:5001" },
  { id: "lan", name: "LAN-gjengen", initials: "LA", color: "#5c3f33", host: "lan.example.com", unread: 12 },
  { id: "jobb", name: "Jobb", initials: "JO", color: "#403357", host: "chat.jobb.no" },
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

/**
 * Channel groups, which the reference arranges channels under.
 *
 * The desktop client has no categories — its channel list is flat — so this is
 * the one shape here that is ahead of the server rather than behind it. It is
 * in the mockup because the reference is built around it and a flat list does
 * not show whether the arrangement works. Nothing reads it yet.
 */
export interface ChannelGroup {
  id: string;
  name: string;
  channels: Channel[];
}

export const GROUPS: ChannelGroup[] = [
  {
    id: "allment",
    name: "Allment",
    channels: [
      { id: "general", name: "general", kind: "text", unread: 3 },
      { id: "tilfeldig", name: "tilfeldig", kind: "text" },
    ],
  },
  {
    id: "arbeid",
    name: "Arbeid",
    channels: [
      { id: "utvikling", name: "utvikling", kind: "text" },
      { id: "design", name: "design", kind: "text", unread: 1 },
    ],
  },
  {
    id: "stemme",
    name: "Stemme",
    channels: [
      { id: "allmenn", name: "Allmenn", kind: "voice", inCall: ["Ingy", "Arne"] },
      { id: "spill", name: "Spill", kind: "voice" },
    ],
  },
];

export interface Message {
  id: string;
  author: string;
  /** Each person gets their own hue, as the voice tiles do. */
  color: string;
  time: string;
  body: string;
  /** A day heading rendered above this message. */
  day?: string;
  /** Stands in for an upload. Drawn as a block rather than fetched. */
  attachment?: { label: string; color: string };
  system?: boolean;
}

export const MESSAGES: Message[] = [
  {
    id: "1",
    author: "vegar",
    color: "#3f5d52",
    time: "08:36",
    body: "joined #design.",
    day: "Aug 5th",
    system: true,
  },
  {
    id: "2",
    author: "Arne",
    color: "#7c5a4b",
    time: "19:05",
    body: "App-ikonet for nightly builds!",
    day: "Today",
    attachment: { label: "gryt-nightly.png", color: "#2b3a63" },
  },
  { id: "3", author: "Simen", color: "#4b5a7c", time: "19:05", body: "Yes. Søtt 🙂" },
  {
    id: "4",
    author: "Ingy Rasmussen",
    color: "#5a4b7c",
    time: "19:11",
    body: "Skal vi ta den inn i 1.6, eller vente til ikonsettet er ferdig?",
  },
];

/** Stands in for the member count the channel header shows. */
export const CHANNEL_MEMBERS = 13;
