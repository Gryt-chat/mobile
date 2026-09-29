import { useCallback } from "react";
import { router, useFocusEffect, type Href } from "expo-router";

export const SERVER_TAB = "/(tabs)/(server)";

/**
 * Back to the tabs that are already mounted. A replace or navigate from a root screen
 * stacks a second copy of the whole app, sockets and server drawer included (GRYT-1623).
 */
export function returnToTabs(href: Href = SERVER_TAB) {
  router.dismissTo(href);
}

/** `returnToTabs` as an element, for a screen that exists only to hand off. */
export function ReturnToTabs({ href = SERVER_TAB }: { href?: Href }) {
  useFocusEffect(
    useCallback(() => {
      returnToTabs(href);
    }, [href]),
  );
  return null;
}
