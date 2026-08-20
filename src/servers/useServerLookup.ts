import { useEffect, useRef, useState } from "react";

import { parseServerInput } from "./address";
import { fetchServerInfo, type ServerInfo } from "./info";

/**
 * How long to wait after the last keystroke before asking the server about
 * itself.
 *
 * The preview fetches on paste rather than on a button, which means it also
 * fetches on every character somebody types by hand. Long enough that typing an
 * address does not fire a request per letter, short enough that a paste — the
 * case this is built for — feels immediate. The same 450 the desktop client
 * uses; the two should not disagree about how responsive this feels.
 */
export const LOOKUP_DEBOUNCE_MS = 450;

export type LookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "info"; host: string; code: string; info: ServerInfo }
  /** Public info is off. Joining may still work with a code. */
  | { kind: "private"; host: string; code: string }
  | { kind: "error"; message: string };

/**
 * Watch a text field and describe whatever server it points at.
 *
 * Every lookup aborts the one before it, which is what makes typing an address
 * settle on the last one rather than on whichever request happened to finish
 * last. A superseded result is dropped rather than rendered — the newer lookup
 * owns the UI by then.
 */
export function useServerLookup(input: string): LookupState {
  const [state, setState] = useState<LookupState>({ kind: "idle" });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const { host, code } = parseServerInput(input);

    abort.current?.abort();

    if (!host) {
      setState({ kind: "idle" });
      return;
    }

    setState({ kind: "loading" });

    const controller = new AbortController();
    abort.current = controller;

    const timer = setTimeout(() => {
      void fetchServerInfo(host, controller.signal).then((result) => {
        if (controller.signal.aborted) return;

        switch (result.kind) {
          case "info":
            setState({ kind: "info", host, code, info: result.info });
            break;
          case "private":
            setState({ kind: "private", host, code });
            break;
          case "error":
            setState({ kind: "error", message: result.message });
            break;
          case "superseded":
            // A newer lookup owns the UI. Leaving this alone is the point.
            break;
        }
      });
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input]);

  return state;
}
