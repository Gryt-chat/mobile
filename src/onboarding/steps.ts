import type { TabKey } from "../shell/tabs";
import type { Mood } from "./GuideOwl";

/**
 * What a step is allowed to do to the app when it becomes current. The phone has no
 * "menu, then Settings" hop like the desktop — a tab switch is the whole move.
 */
export interface TourControls {
  switchTab: (key: TabKey) => void;
  openServerSettings: () => void;
}

export interface TourStep {
  id: string;
  /** Matches a `TourTarget` id somewhere in the tree. */
  target: string;
  title: string;
  body: string;
  /** The owl's face once it has said the line. */
  mood?: Mood;
  /** Points at the target while it talks, as in the film. False keeps the arm in. */
  point?: boolean;
  /** Run when the step becomes current, before the target is measured. */
  enter?: (controls: TourControls) => void;
}

/**
 * Four stops, ported from the desktop's five. It drops the invite-paste step: this
 * tour runs after the first join, not before it, so there is nowhere new to send you.
 */
export const tourSteps: TourStep[] = [
  {
    id: "menu",
    target: "you-tab",
    title: "Everything about you is here",
    body: "Your profile, your settings, and signing in when you want to. The rightmost tab, always.",
  },
  {
    id: "profile",
    target: "profile-card",
    title: "Pick a name and a face",
    body: "A nickname, and a picture if you want one. Neither is permanent, and you can change them whenever.",
    mood: "wink",
    enter: (controls) => controls.switchTab("you"),
  },
  {
    id: "account",
    target: "account-row",
    title: "An account, if you ever want one",
    body: "Gryt works without one. An account gives you a way back in if you lose this device, and makes you the same person on every server. Some servers only let in people who have one.",
  },
  {
    id: "server",
    target: "server-switcher",
    title: "Switch servers, or add another",
    body: "Tap here to jump between servers you have joined, or add one — a friend's, or your own.",
    enter: (controls) => controls.switchTab("(server)"),
  },
];

/** The first time somebody owns a server. The phone's server settings has these rows; name and who can join are desktop-only so far. */
export const ownerTourSteps: TourStep[] = [
  {
    id: "owner-menu",
    target: "server-switcher",
    title: "Your server's settings are here",
    body: "Hold the server's name for its menu. Server settings is in there.",
    enter: (controls) => controls.switchTab("(server)"),
  },
  {
    id: "owner-invites",
    target: "server-settings-invites",
    title: "Invites let people in",
    body: "Make a code to share with friends, and see who has used it.",
    enter: (controls) => controls.openServerSettings(),
  },
  {
    id: "owner-emojis",
    target: "server-settings-emoji",
    title: "Your server's own emoji",
    body: "Add pictures everyone here can use in messages and reactions.",
  },
  {
    id: "owner-roles",
    target: "server-settings-roles",
    title: "Roles decide who can do what",
    body: "Give your moderators what they need here, and keep the rest for yourself.",
    mood: "wink",
  },
];
