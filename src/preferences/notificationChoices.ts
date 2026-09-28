import type { NotificationLevel } from "../connection/types";

/** The four answers a server or a channel can be set to, shared by every menu that
    offers them (GRYT-1534). "Default" is not in here — it is `null`, not a level. */
export const LEVEL_CHOICES: { value: NotificationLevel; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "mentions", label: "Only mentions" },
  { value: "none", label: "Nothing" },
];

export const LEVEL_WORDS: Record<NotificationLevel, string> = {
  all: "everything",
  mentions: "only mentions",
  none: "nothing",
};

export function levelLabel(level: NotificationLevel): string {
  return LEVEL_CHOICES.find((c) => c.value === level)?.label ?? level;
}
