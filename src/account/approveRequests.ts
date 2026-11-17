import { useSyncExternalStore } from "react";

/** One device waiting for you to approve it, on one server, until its ticket runs out. */
export interface ApproveRequest {
  host: string;
  askId: string;
  deviceType: string;
  askedAt: number;
  expiresAt: number;
  deny: () => void;
}

let requests: readonly ApproveRequest[] = [];
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function set(next: readonly ApproveRequest[]): void {
  requests = next;
  if (timer) clearTimeout(timer);
  const soonest = Math.min(...requests.map((r) => r.expiresAt));
  timer = Number.isFinite(soonest) ? setTimeout(() => set(requests.filter((r) => r.expiresAt > Date.now())), soonest - Date.now() + 50) : null;
  for (const listener of listeners) listener();
}

export function addApproveRequest(request: ApproveRequest): void {
  if (request.expiresAt <= Date.now()) return;
  set([...requests.filter((r) => !(r.host === request.host && r.askId === request.askId)), request]);
}

export function removeApproveRequest(host: string, askId?: string): void {
  set(requests.filter((r) => r.host !== host || (askId !== undefined && r.askId !== askId)));
}

export function useApproveRequests(): readonly ApproveRequest[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => requests,
  );
}
