import { InteractionManager } from "react-native";

import type { NotificationLevel } from "../connection/types";
import { getOwnLevel, setNotificationLevel, type NotificationScope } from "../notify/notificationPrefs";
import { LEVEL_CHOICES, LEVEL_WORDS } from "./notificationChoices";

type Present = (options: {
  title?: string;
  message?: string;
  options: string[];
  cancelButtonIndex?: number;
}) => Promise<number>;

/**
 * The level picker both long-press menus share (GRYT-1534). "Default" is always the
 * last real option, and follows whatever this scope would inherit.
 */
export function pickNotificationLevel(
  present: Present,
  host: string,
  scope: NotificationScope,
  title: string,
  subject: string,
  inherited: NotificationLevel,
): void {
  const own = getOwnLevel(host, scope);
  const defaultLabel = `Default (${LEVEL_WORDS[inherited]})`;
  const options = [...LEVEL_CHOICES.map((c) => c.label), defaultLabel, "Cancel"];

  InteractionManager.runAfterInteractions(() => {
    void present({
      title,
      message: `${subject}\n\nNow: ${own ? LEVEL_WORDS[own] : defaultLabel}`,
      options,
      cancelButtonIndex: options.length - 1,
    }).then((index) => {
      if (index < 0 || index >= options.length - 1) return;
      setNotificationLevel(host, scope, index < LEVEL_CHOICES.length ? LEVEL_CHOICES[index].value : null);
    });
  });
}
