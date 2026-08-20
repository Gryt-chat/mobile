/* What is left of the mockups.
 *
 * The server list, the channels and the messages were all fake and are gone —
 * servers are real now and come from `src/servers`. What remains is the local
 * identity, which is still a placeholder because there is nothing to ask yet:
 * a nickname lives in the client's own settings and a per-server profile comes
 * from the socket, and this app has neither.
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

/** A placeholder identity. Replaced by settings and the socket. */
export const ME = {
  name: "You",
  userId: "not signed in",
};
