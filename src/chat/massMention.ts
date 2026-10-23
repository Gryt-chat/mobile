import type { Member } from "../connection/types";

/** What to ask before an @everyone or @here goes out, or null to send without asking. */
export function massMentionPrompt(
  text: string,
  members: Pick<Member, "serverUserId" | "status">[],
  meId: string | null,
): { title: string; message: string } | null {
  const everyone = /(^|\s)@everyone\b/.test(text);
  if (!everyone && !/(^|\s)@here\b/.test(text)) return null;
  const others = members.filter((m) => m.serverUserId !== meId);
  const online = others.filter((m) => m.status !== "offline").length;
  const reach = everyone ? others.length : online;
  if (reach === 0) return null;
  return {
    title: `Notify up to ${reach} ${reach === 1 ? "person" : "people"}?`,
    message: everyone
      ? `@everyone pings everyone who can read this channel, and ${online} of them are online right now. Each of them gets a notification.`
      : "@here pings everyone who's online and can read this channel. Each of them gets a notification.",
  };
}
