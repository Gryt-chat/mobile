import { InteractionManager } from "react-native";

import { setServerContactRule, type ContactPrefs, type StoredContactPrefs } from "../connection/contactPrefs";
import { CALL_CHOICES, choiceLabel, MESSAGE_CHOICES } from "./contactChoices";

export const MESSAGES_TITLE = "Who can send me messages";
export const CALLS_TITLE = "Who can call me";

type Present = (options: {
  title?: string;
  message?: string;
  options: string[];
  cancelButtonIndex?: number;
}) => Promise<number>;

/**
 * A server's own answer (GRYT-1470), or back to the one in Preferences. Shared by
 * the server's long-press menu and the Privacy screen. Saved on the tap.
 */
export function pickContactRule(
  present: Present,
  server: { host: string; name: string },
  kind: keyof ContactPrefs,
  stored: StoredContactPrefs,
): void {
  const choices = kind === "messages" ? MESSAGE_CHOICES : CALL_CHOICES;
  const own = stored.servers[server.host]?.[kind] ?? null;
  const followLabel = `Same as Preferences (${choiceLabel(kind, stored.global[kind])})`;
  const options = [...choices.map((c) => c.label), followLabel, "Cancel"];

  InteractionManager.runAfterInteractions(() => {
    void present({
      title: kind === "messages" ? MESSAGES_TITLE : CALLS_TITLE,
      message: `${server.name}\n\nNow: ${own ? choiceLabel(kind, own) : followLabel}`,
      options,
      cancelButtonIndex: options.length - 1,
    }).then((index) => {
      if (index < 0 || index >= options.length - 1) return;
      setServerContactRule(server.host, kind, index < choices.length ? choices[index].value : null);
    });
  });
}
