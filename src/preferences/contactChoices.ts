import type { ContactRule } from "../connection/contactPrefs";

/** The words for each answer, shared by Preferences and the server menu (GRYT-1470). */
export interface ContactChoice {
  value: ContactRule;
  label: string;
  hint: string;
}

export const MESSAGE_CHOICES: ContactChoice[] = [
  { value: "everyone", label: "Anyone on the server", hint: "Anybody who shares the server with you." },
  {
    value: "friends",
    label: "Friends",
    hint: "People you've added on that server. Until you add one, anybody you've written to counts.",
  },
  { value: "nobody", label: "Nobody", hint: "Conversations you already have stop taking messages too, and nobody can send you a friend request." },
];

export const CALL_CHOICES: ContactChoice[] = [
  { value: "everyone", label: "Anyone who can message me", hint: "Whoever your message setting lets through." },
  { value: "friends", label: "Friends", hint: "People you've added on that server. Until you add one, anybody you've written to counts." },
  { value: "nobody", label: "Nobody", hint: "Nothing rings." },
];

export function choiceLabel(kind: "messages" | "calls", rule: ContactRule): string {
  const list = kind === "messages" ? MESSAGE_CHOICES : CALL_CHOICES;
  return list.find((c) => c.value === rule)?.label ?? rule;
}
