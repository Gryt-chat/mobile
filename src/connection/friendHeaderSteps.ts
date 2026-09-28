import type { FriendAction } from "./friendsStore";
import type { FriendState } from "./friendList";

/** Which icon a step draws. ChannelScreen.tsx owns the mapping to a component. */
export type FriendHeaderIcon = "add" | "clock" | "check" | "close";

export interface FriendHeaderConfirm {
  title: string;
  confirmLabel: string;
  cancelLabel: string;
}

export interface FriendHeaderStep {
  action: FriendAction;
  /** What the pill shows next to the icon -- short enough for a 375pt header. */
  label: string;
  /** The fuller sentence: VoiceOver's accessibilityLabel, and the confirm title. */
  hint: string;
  icon: FriendHeaderIcon;
  /** Drawn in the accent colour, the way "incoming" already was before this. */
  accent: boolean;
  /** Set only for an action that shouldn't fire on the first tap. */
  confirm?: FriendHeaderConfirm;
}

/**
 * What the DM header's friend icon offers next (GRYT-1471, GRYT-1573). `name` is
 * the other person's display name, already resolved by the header itself.
 */
export function friendHeaderSteps(state: FriendState, name: string): FriendHeaderStep[] {
  switch (state) {
    case "none":
      return [{ action: "request", label: "Add friend", hint: `Add ${name} as a friend`, icon: "add", accent: false }];

    case "outgoing":
      return [{
        action: "cancel",
        label: "Requested",
        hint: `Waiting for ${name} to accept. Tap to cancel.`,
        icon: "clock",
        accent: false,
        confirm: {
          title: `Cancel your friend request to ${name}?`,
          confirmLabel: "Cancel request",
          cancelLabel: "Keep waiting",
        },
      }];

    case "incoming":
      return [
        { action: "accept", label: "Accept", hint: `Accept ${name}'s friend request`, icon: "check", accent: true },
        { action: "decline", label: "Decline", hint: `Decline ${name}'s friend request`, icon: "close", accent: false },
      ];

    case "unconfirmed":
    case "friend":
      return [];
  }
}
