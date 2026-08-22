import { usePathname } from "expo-router";
import { useEffect } from "react";

/**
 * The two things a report knows about this run that the form cannot see for
 * itself.
 *
 * **Where they were.** The service's `context.route` wants "where in the app
 * they were", and the obvious reading — ask the form what route it is on —
 * answers `/report`, which is the one route that cannot be the reason for a bug
 * report. So the tabs remember.
 *
 * **How long they had been running.** `context.sessionUptimeSec`. "It broke
 * twenty minutes in" and "it broke on launch" are different bugs, and nobody
 * thinks to write down which one it was.
 *
 * Module variables rather than context, because the form is pushed *over* the
 * tabs and is outside their providers, and because nothing should re-render on
 * either of these.
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
 * Seconds since this module was first imported, which is app start.
 *
 * Not since the form opened, and not wall-clock uptime of the device. Whole
 * seconds because the service stores it as a number somebody reads, and a
 * fractional one implies a precision that a bug report does not have.
 */
export function sessionUptimeSec(): number {
  return Math.round((Date.now() - startedAt) / 1000);
}
