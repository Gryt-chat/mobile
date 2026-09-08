import { usePathname } from "expo-router";
import { useEffect } from "react";

/**
 * What a report knows about this run and the form cannot see: where they were, since the
 * form answers `/report`, and for how long. Module variables — the form sits over tabs.
 */

const startedAt = Date.now();

let last: string | null = null;

/** Called from the tabs, which are the routes worth remembering. */
export function useRememberRoute(): void {
  const pathname = usePathname();

  useEffect(() => {
    /* Not the form itself, and not the screens reached from it — otherwise
     * opening the form is what the form reports. */
    if (pathname && !pathname.startsWith("/report")) last = pathname;
  }, [pathname]);
}

export function lastRoute(): string | null {
  return last;
}

/**
 * Seconds since this module was first imported, which is app start. Whole seconds: a
 * fractional one implies a precision a bug report does not have.
 */
export function sessionUptimeSec(): number {
  return Math.round((Date.now() - startedAt) / 1000);
}
