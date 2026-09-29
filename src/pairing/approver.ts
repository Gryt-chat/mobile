import {
  createApproverPairing,
  type ApproverState,
  type HistoryArchive,
  type HistoryNotedMessage,
  type HistoryProgress,
  type OwnDeviceAdder,
  type PairingClock,
  type PairingEndReason,
  type PairingFetch,
  type PairingRelay,
} from "@gryt/core";
import type { PairingEnvelope } from "@gryt/crypto";

/* The phone approving a new device: core's machine, plus what only the phone does around it.
   No React and no native modules in here, so the tests drive it against a fake relay. */

/** Face ID, Touch ID or the passcode. "none" means the phone has no lock to ask for. */
export type OwnerCheck = "ok" | "refused" | "none";

export interface PhoneApproverOptions {
  relay: PairingRelay;
  relayOrigin: string;
  fetch: PairingFetch;
  devices: OwnDeviceAdder;
  confirmOwner: (deviceName: string) => Promise<OwnerCheck>;
  collectEnvelope: () => Promise<PairingEnvelope>;
  /** A fresh access token, or null when the account is signed out. */
  refreshAccessToken: () => Promise<string | null>;
  clock?: PairingClock;
  approvalMs?: number;
  /** The local archive, only when it's open. Without it the link still works, with no history. */
  history?: HistoryArchive;
  lateWindowMs?: number;
}

export interface PhoneApproverState {
  pairing: ApproverState;
  /** Face ID or the passcode is up, or the envelope is being read. */
  approving: boolean;
  /** The last Face ID or passcode check didn't pass. Approve can be tried again inside the window. */
  ownerRefused: boolean;
  /** Set when the phone stopped the link itself, before or instead of the relay. */
  localEnd: PairingEndReason | null;
  /** How the message history is going, from Approve on. Null with no archive. */
  history: HistoryProgress | null;
}

export interface PhoneApprover {
  readonly state: PhoneApproverState;
  subscribe(listener: (state: PhoneApproverState) => void): () => void;
  claim(input: { qr: string } | { code: string }): void;
  approve(): Promise<void>;
  deny(): Promise<void>;
  mismatch(): Promise<void>;
  cancel(): Promise<void>;
  /** Every MLS message this phone archives while the link runs, for the history's tail. */
  noteMessage(message: HistoryNotedMessage): void;
}

/** Past Approve and not finished: the new device is being signed in, added or sent history. */
export function isInFlight(phase: ApproverState["phase"]): boolean {
  return phase === "signing_in" || phase === "browser" || phase === "waiting_ready" || phase === "adding" || phase === "sending";
}

export function createPhoneApprover(options: PhoneApproverOptions): PhoneApprover {
  const pairing = createApproverPairing({
    relay: options.relay,
    relayOrigin: options.relayOrigin,
    fetch: options.fetch,
    devices: options.devices,
    clock: options.clock,
    approvalMs: options.approvalMs,
    history: options.history,
    lateWindowMs: options.lateWindowMs,
  });
  const listeners = new Set<(state: PhoneApproverState) => void>();
  let state: PhoneApproverState = {
    pairing: pairing.state,
    approving: false,
    ownerRefused: false,
    localEnd: null,
    history: pairing.history,
  };

  const set = (next: Partial<PhoneApproverState>) => {
    state = { ...state, ...next };
    for (const l of listeners) l(state);
  };
  pairing.subscribe((next) => set({ pairing: next, ...(next.phase === "ended" ? { approving: false } : {}) }));
  pairing.subscribeHistory((history) => set({ history }));

  const endLocally = async (reason: PairingEndReason) => {
    set({ localEnd: reason, approving: false });
    await pairing.cancel();
  };

  async function approve() {
    const current = pairing.state;
    if (current.phase !== "confirming" || state.approving) return;
    set({ approving: true, ownerRefused: false });
    try {
      const check = await options.confirmOwner(current.device.name);
      if (check === "refused") return set({ approving: false, ownerRefused: true });

      const envelope = await options.collectEnvelope();
      // Refreshed once here to find out the session is alive, and again by core just before the call.
      if (envelope.account && !(await options.refreshAccessToken())) return endLocally("approve:no_token");
      if (pairing.state.phase !== "confirming") return set({ approving: false });

      const token = async () => {
        const fresh = await options.refreshAccessToken();
        if (!fresh) throw new Error("Signed out while linking.");
        return fresh;
      };
      pairing.approve(envelope, envelope.account ? token : undefined);
      set({ approving: false });
    } catch {
      await endLocally("relay_error");
    }
  }

  return {
    get state() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    claim: (input) => pairing.claim(input),
    approve,
    deny: () => pairing.deny(),
    mismatch: () => pairing.mismatch(),
    cancel: () => pairing.cancel(),
    noteMessage: (message) => pairing.noteMessage(message),
  };
}

/** The reason to show once a link has ended: the phone's own, or core's. */
export function endReasonOf(state: PhoneApproverState): PairingEndReason | null {
  if (state.localEnd) return state.localEnd;
  return state.pairing.phase === "ended" ? state.pairing.reason : null;
}
