import type { TabKey } from "../shell/tabs";

/**
 * What a step is allowed to do to the app when it becomes current. The phone has no
 * "menu, then Settings" hop like the desktop — a tab switch is the whole move.
 */
export interface TourControls {
  switchTab: (key: TabKey) => void;
}

export interface TourStep {
  id: string;
  /** Matches a `TourTarget` id somewhere in the tree. */
  target: string;
  title: string;
  body: string;
  /** Which side of the cut-out the card sits on. No left/right on a phone's width. */
  side: "above" | "below";
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
    side: "above",
  },
  {
    id: "profile",
    target: "profile-card",
    title: "Pick a name and a face",
    body: "A nickname, and a picture if you want one. Neither is permanent, and you can change them whenever.",
    side: "below",
    enter: (controls) => controls.switchTab("you"),
  },
  {
    id: "account",
    target: "account-row",
    title: "An account, if you ever want one",
    body: "You do not need one. It carries your servers and settings between machines, and that is the only thing it is for.",
    side: "above",
  },
  {
    id: "server",
    target: "server-switcher",
    title: "Switch servers, or add another",
    body: "Tap here to jump between servers you have joined, or add one — a friend's, or your own.",
    side: "below",
    enter: (controls) => controls.switchTab("(server)"),
  },
];
