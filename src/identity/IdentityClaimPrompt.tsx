import { useEffect, useRef } from "react";

import { useActionSheet } from "../ui/actionSheet";
import { useIdentityClaim } from "./useIdentityClaim";

/**
 * Asked about one server, when you are signed in and have been a guest here
 * before. This app used to sign the link on every account-tier join, telling
 * every server it had been a guest on that the account was the same person
 * (GRYT-502).
 *
 * **The proof that an account controls a guest identity is also the
 * disclosure**, so once it reaches the server, declining changes nothing. The
 * question has to be answerable from the local guest history.
 *
 * An action sheet rather than a Dialog: on iOS UIKit presents it, so it does
 * not wait for anything else to finish dismissing. **It never asked on Android
 * until GRYT-560** — not being asked a question looks exactly like there being
 * no question to ask.
 *
 * Dismissing without answering means being asked again, which is the safe
 * direction: an iOS action sheet is dismissible whatever it is given.
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
