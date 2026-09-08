/* The mockups are gone; `useMe` reads the account. `Status` is the client's `UserStatus`,
 * verbatim, and all four are derived. */

export type Status = "online" | "in_voice" | "afk" | "offline";

export const STATUS_LABEL: Record<Status, string> = {
  in_voice: "In Voice",
  online: "Online",
  afk: "AFK",
  offline: "Offline",
};
