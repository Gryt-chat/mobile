import type { ArchivedMessage } from "../archive/messageArchive";
import { isInFlight, type PhoneApprover } from "./approver";
import { holdDeviceNotices } from "./deviceNotices";
import { toHistoryRecord } from "./historyRecords";

/* The one link this phone is approving, outside the screen: leaving the screen after Approve
   doesn't stop it, and MLS hands it every message archived while it runs. */

let active: PhoneApprover | null = null;
let unsubscribe: (() => void) | null = null;

function release(): void {
  unsubscribe?.();
  unsubscribe = null;
  active = null;
  holdDeviceNotices(false);
}

/** Make `approver` the running one. It lets go of itself once it's done or has ended. */
export function adoptApprover(approver: PhoneApprover): void {
  if (active === approver) return;
  release();
  active = approver;
  unsubscribe = approver.subscribe((state) => {
    const phase = state.pairing.phase;
    if (phase === "done" || phase === "ended") return release();
    holdDeviceNotices(state.approving || isInFlight(phase));
  });
}

/** The running link, when it's past Approve and still going, for the screen to show again. */
export function approverInFlight(): PhoneApprover | null {
  return active && isInFlight(active.state.pairing.phase) ? active : null;
}

/** From the MLS session, after it writes a message it received or sent. */
export function noteArchived(
  host: string,
  archived: { conversationId: string; seq: number; epoch: number; record: ArchivedMessage },
): void {
  if (!active) return;
  active.noteMessage({
    host,
    conversationId: archived.conversationId,
    seq: archived.seq,
    epoch: archived.epoch,
    record: toHistoryRecord(archived.record),
  });
}
