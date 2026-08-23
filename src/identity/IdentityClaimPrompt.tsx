import { useEffect, useRef } from "react";

import { useActionSheet } from "../ui/actionSheet";
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
 * leaving a server, signing out, changing the auth server. On iOS UIKit
 * presents it, so it does not have to wait for anything else to finish
 * dismissing, which is the failure a Dialog hit when it was asked from inside
 * the switcher.
 *
 * **It never asked on Android until GRYT-560.** The effect returned on any
 * platform that was not iOS, so an Android user who had been a guest here was
 * silently never offered the membership — and the guest history it reads sat
 * there unused. Of the four sheets this app had, this is the one whose absence
 * was hardest to notice, because not being asked a question looks exactly like
 * there being no question to ask.
 *
 * The desktop's version cannot be dismissed without answering, on the grounds
 * that an undecided server gets asked again on the next visit. A phone cannot
 * do that honestly — an iOS action sheet is dismissible whatever it is given —
 * so being asked again is the behaviour here. That is the safe direction: the
 * cost is a repeated question, and the alternative is a modal with no way out.
 */
export function IdentityClaimPrompt({ host }: { host: string | null }) {
  const { shouldAsk, claim, decline } = useIdentityClaim(host);
  const present = useActionSheet();

  /* One sheet per server, however many times this re-renders while the answer
   * is outstanding. Without it, every render that still says "ask" stacks
   * another sheet on the last. */
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (!host) {
      asked.current = null;
      return;
    }
    if (!shouldAsk || asked.current === host) return;
    asked.current = host;

    void present({
      title: "Use your previous membership here?",
      message:
        "You used this server before signing in. Gryt can attach that membership to your account, so you keep your roles, anything you own and the history attached to it.\n\nOnly do this if that was you.",
      options: ["Use previous membership", "Keep separate"],
      cancelButtonIndex: 1,
    }).then((index) => {
      if (index === 0) void claim();
      else if (index === 1) void decline();
      /* Anything else is a dismissal without an answer. Left undecided on
       * purpose: nothing has been disclosed, and the next visit asks again.
       *
       * Both platforms report a dismissal as the cancel index rather than as
       * nothing, so in practice this branch is the one that does not happen —
       * dismissing is declining, on iOS as much as here. Worth saying plainly
       * rather than leaving the comment above implying otherwise. */
    });
  }, [host, shouldAsk, claim, decline, present]);

  return null;
}
