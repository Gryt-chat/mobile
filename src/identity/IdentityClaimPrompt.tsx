import { useEffect, useRef } from "react";

import { useActionSheet } from "../ui/actionSheet";
import { useIdentityClaim } from "./useIdentityClaim";
import { identityScopeFor } from "./scope";

/**
 * Asked about one server, when you are signed in and were a guest here before. The proof
 * is the disclosure, so the question is answerable from the local guest history alone.
 */
export function IdentityClaimPrompt({ host }: { host: string | null }) {
  const { shouldAsk, lastUsed, claim, decline } = useIdentityClaim(host);
  const present = useActionSheet();

  /* One sheet per server, however many times this re-renders: without it, every render
   * that still says "ask" stacks another sheet on the last. */
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
      /* Anything else is "ask me later", a swipe dismissal included: nothing is stored
       * because nothing was disclosed, and a stored no takes the offer away for good. */
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
