import { useEffect, useRef } from "react";
import { ActionSheetIOS, Platform } from "react-native";

import { useIdentityClaim } from "./useIdentityClaim";

/**
 * Asked about one server, when you are signed in and have been a guest here
 * before.
 *
 * Replaces nothing on this app, because this app never asked — it signed the
 * link on every account-tier join and told every server it had ever been a
 * guest on that the account was the same person. GRYT-502.
 *
 * ## Why it can ask before anything is sent
 *
 * The proof that an account controls a guest identity is also the disclosure
 * that they are the same person. Once it reaches the server, declining changes
 * nothing. So the question has to be answerable without asking the server, and
 * it is: the guest history is a local record of having been here, kept
 * precisely so this can come first.
 *
 * ## An action sheet, not a Dialog
 *
 * The same call the rest of the app makes for a question with consequences —
 * leaving a server, signing out, changing the auth server. UIKit presents it,
 * so it does not have to wait for anything else to finish dismissing, which is
 * the failure a Dialog hit when it was asked from inside the switcher.
 *
 * The desktop's version cannot be dismissed without answering, on the grounds
 * that an undecided server gets asked again on the next visit. A phone cannot
 * do that honestly — an iOS action sheet is dismissible whatever it is given —
 * so being asked again is the behaviour here. That is the safe direction: the
 * cost is a repeated question, and the alternative is a modal with no way out.
 */
export function IdentityClaimPrompt({ host }: { host: string | null }) {
  const { shouldAsk, claim, decline } = useIdentityClaim(host);

  /* One sheet per server, however many times this re-renders while the answer
   * is outstanding. Without it, every render that still says "ask" stacks
   * another `UIAlertController` on the last. */
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (!host) {
      asked.current = null;
      return;
    }
    if (!shouldAsk || asked.current === host || Platform.OS !== "ios") return;
    asked.current = host;

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Use your previous membership here?",
        message:
          "You used this server before signing in. Gryt can attach that membership to your account, so you keep your roles, anything you own and the history attached to it.\n\nOnly do this if that was you.",
        options: ["Use previous membership", "Keep separate"],
        cancelButtonIndex: 1,
        userInterfaceStyle: "dark",
      },
      (index) => {
        if (index === 0) void claim();
        else if (index === 1) void decline();
        /* Anything else is a dismissal without an answer. Left undecided on
         * purpose: nothing has been disclosed, and the next visit asks again. */
      },
    );
  }, [host, shouldAsk, claim, decline]);

  return null;
}
