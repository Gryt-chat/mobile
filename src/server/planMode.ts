/** A Gryt Cloud server after a failed payment. The words are ours, and match the desktop's planMode.ts. */
export type PlanMode = "active" | "read_only" | "paused";

export function isLapsedPlanMode(v: string | undefined): v is Exclude<PlanMode, "active"> {
  return v === "read_only" || v === "paused";
}

export function planModeBannerText(mode: Exclude<PlanMode, "active">, isOwner: boolean): string {
  if (mode === "paused") {
    return isOwner
      ? "This server is paused because its plan wasn't renewed. Only you can open it until it is."
      : "This server is paused until its owner renews its plan.";
  }
  return isOwner
    ? "This server's Gryt Cloud payment didn't go through, so it's read-only. Members can still read and use voice. Renew the plan to turn messages and uploads back on."
    : "This server is read-only for now. You can still read and use voice, but new messages and uploads are off until its plan is renewed.";
}

export function planModeRefusalText(mode: Exclude<PlanMode, "active">): string {
  return mode === "paused"
    ? "This server is paused, so that didn't go through."
    : "This server is read-only right now, so that didn't go through.";
}
