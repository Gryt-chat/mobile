/* The mockups are gone.
 *
 * The server list, the channels and the messages were fake once and are real
 * now. The last of it was `ME`, a `{ name: "You", userId: "not signed in" }`
 * constant — wrong in a way worth naming, because the generated face is seeded
 * on the name, so every person on every phone was drawn as *the same face*.
 * `useMe` reads the account instead.
 *
 * `Status` is the client's `UserStatus`, verbatim. All four are derived from
 * what you are doing rather than picked from a menu, which is why the "you"
 * sheet shows a status and does not offer one.
 */

export type Status = "online" | "in_voice" | "afk" | "offline";

export const STATUS_LABEL: Record<Status, string> = {
  in_voice: "In Voice",
  online: "Online",
  afk: "AFK",
  offline: "Offline",
};
