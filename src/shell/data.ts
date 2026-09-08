/* The mockups are gone. The last of it was `ME`, whose `"You"` seeded the generated face
 * — so every person on every phone was drawn as the same face. `useMe` reads the account.
 *
 * `Status` is the client's `UserStatus`, verbatim, and all four are derived. */

export type Status = "online" | "in_voice" | "afk" | "offline";

export const STATUS_LABEL: Record<Status, string> = {
  in_voice: "In Voice",
  online: "Online",
  afk: "AFK",
  offline: "Offline",
};
