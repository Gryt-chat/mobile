import { useEffect, useRef, useState } from "react";

import { parseServerInput } from "./address";
import { fetchServerInfo, type ServerInfo } from "./info";

/**
 * How long to wait after the last keystroke before asking a server about
 * itself. The preview fetches on paste, so it also fetches on every character
 * typed by hand. **The same 450 the desktop uses** — the two should not
 * disagree about how responsive this feels.
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
 * Watch a text field and describe whatever server it points at. **Every lookup
 * aborts the one before it**, so typing settles on the last address rather than
 * on whichever request finished last.
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
