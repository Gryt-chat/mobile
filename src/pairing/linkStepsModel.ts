import type { ApproverState, HistoryProgress, NewDeviceState } from "@gryt/core";

import { gettingHistoryText } from "./newDeviceWords";
import { sendingHistoryText } from "./words";

export interface LinkStep {
  label: string;
  detail?: string;
  state: "done" | "busy" | "todo";
}

/** Marks each step done, busy or todo from where `at` is in the list. */
export function stepsAt(labels: { label: string; detail?: string }[], at: number): LinkStep[] {
  return labels.map((s, i) => {
    if (i < at) return { ...s, state: "done" };
    return { ...s, state: i === at ? "busy" : "todo" };
  });
}

export type ApproverInFlight = Extract<ApproverState, { phase: "signing_in" | "browser" | "waiting_ready" | "adding" | "sending" }>;
const APPROVER_ORDER: ApproverInFlight["phase"][] = ["signing_in", "waiting_ready", "adding", "sending"];

/** The approving side, from Approve to Done. The sign-in row only exists for an account. */
export function approverSteps(pairing: ApproverInFlight, history: HistoryProgress | null, signedIn: boolean): LinkStep[] {
  const name = pairing.device.name || "device";
  const labels = [
    { label: "Checked it's yours", detail: "The pictures matched" },
    ...(signedIn ? [{ label: `Signing in your ${name}` }] : []),
    { label: `Waiting for your ${name} to join your servers` },
    { label: "Adding it to your chats", detail: pairing.phase === "adding" && pairing.total ? `${pairing.done} of ${pairing.total}` : undefined },
    ...(history
      ? [{ label: "Copying older messages", detail: pairing.phase === "sending" && history.total !== 0 ? sendingHistoryText(history) : undefined }]
      : []),
  ];
  const at = APPROVER_ORDER.indexOf(pairing.phase === "browser" ? "signing_in" : pairing.phase) + (signedIn ? 1 : 0);
  return stepsAt(labels, at);
}

/** The new device's side, from Approve until the history is in. */
export function newDeviceSteps(
  pairing: NewDeviceState,
  joined: { done: number; total: number } | null,
  history: HistoryProgress | null,
  signedIn: boolean,
): LinkStep[] {
  const from = "from" in pairing ? pairing.from : "your other device";
  const labels = [
    { label: "Checked it's yours", detail: `The pictures matched on ${from}` },
    ...(signedIn ? [{ label: pairing.phase === "signing_in" ? `Signing in as ${pairing.username}` : "Signed in" }] : []),
    { label: "Connecting to your servers", detail: joined && joined.total ? `${joined.done} of ${joined.total}` : undefined },
    { label: "Getting added to your chats", detail: `${from} does this` },
    ...(history ? [{ label: "Getting older messages", detail: gettingHistoryText(history) }] : []),
  ];
  if (pairing.phase === "signing_in") return stepsAt(labels, 1);
  let at = 0;
  if (pairing.phase === "joining") at = 1;
  else if (pairing.phase === "linked") at = history ? 3 : 2;
  return stepsAt(labels, at + (signedIn ? 1 : 0));
}
