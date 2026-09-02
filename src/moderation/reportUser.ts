/**
 * What a report about a person carries, and whether it can be sent yet.
 *
 * Its own module for the same reason `banOptions` is: the screen is a form, and
 * a form's rules are the part worth testing without a renderer. The cap matches
 * the server's `REASON_MAX` in `socket/handlers/reports.ts` — a longer one is
 * refused there, and the field should not let somebody type past it and find
 * out afterwards.
 */

export const REPORT_REASON_MAX = 1000;

export interface ReportUserRequest {
  serverUserId: string;
  reason: string;
}

/**
 * Whether there is a report to send.
 *
 * Trimmed, because whitespace is what an accidental tap on the field produces
 * and the server refuses it. Unlike a ban, the reason is not optional: a ban
 * has the act itself as its record, and a report about somebody with nothing
 * attached tells a moderator only that somebody is unhappy.
 */
export function canSendReport(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length > 0 && trimmed.length <= REPORT_REASON_MAX;
}

export function buildReportRequest({
  serverUserId,
  reason,
}: {
  serverUserId: string;
  reason: string;
}): ReportUserRequest {
  return { serverUserId, reason: reason.trim() };
}
