import { useEffect, useRef } from "react";

import { useActionSheet } from "../ui/actionSheet";
import { useIdentityClaim } from "./useIdentityClaim";
import { identityScopeFor } from "./scope";

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
 * The question is what happens to the old user, so that is what it asks, and it
 * shows when that user last connected so there is something to decide on.
 */
export function IdentityClaimPrompt({ host }: { host: string | null }) {
  const { shouldAsk, lastUsed, claim, decline } = useIdentityClaim(host);
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
    const scope = identityScopeFor(host);
    if (!shouldAsk || asked.current === host || postponed.has(scope)) return;
    asked.current = host;

    void present({
      title: "You already have a user on this server",
      message: [
        `Before you signed in, this device used ${host} as a guest.${
          lastUsed === null ? "" : ` Last used ${formatLastUsed(lastUsed)}.`
        }`,
        "Should that user become your account here? It keeps its roles, anything it owns and its history.",
        "Only say yes if that user was you. On a shared computer it belongs to whoever used it last. You can't undo it.",
      ].join("\n\n"),
      options: ["Yes, convert my user", "No, this is a new user", "Ask me later"],
      cancelButtonIndex: 2,
    }).then((index) => {
      if (index === 0) void claim();
      else if (index === 1) void decline();
      /* Anything else is "ask me later", a swipe dismissal included — both
       * platforms report one as the cancel index. Nothing is stored, because
       * nothing has been disclosed. Suppressed for this launch so waving it off
       * does not mean meeting it again on the next server switch, and offered
       * again next launch; the server menu has it in the meantime.
       *
       * Dismissing used to land on "Keep separate" and write a no. That is a
       * decision nobody made, and it is the one that takes the offer off this
       * prompt for good. */
      else postponed.add(scope);
    });
  }, [host, shouldAsk, lastUsed, claim, decline, present]);

  return null;
}

/** Scopes waved off since launch. Deliberately not persisted. */
const postponed = new Set<string>();

/**
 * The date, in the reader's locale. The year appears only when it is not this
 * one, so the common case reads "12 August".
 */
function formatLastUsed(epochMs: number): string {
  const date = new Date(epochMs);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
