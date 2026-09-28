import {
  createNewDevicePairing,
  type NewDeviceState,
  type PairedServerDevice,
  type PairingClock,
  type PairingDeviceInfo,
  type PairingOidc,
  type PairingRelay,
  type PairingTokens,
} from "@gryt/core";
import type { PairingEnvelope } from "@gryt/crypto";

/* The phone being linked: core's machine, plus joining each server and saying "ready" once
   its MLS device is up there. No React and no native modules, so tests drive it headless. */

export interface PhoneNewDeviceOptions {
  relay: PairingRelay;
  device: PairingDeviceInfo;
  oidc: PairingOidc;
  /** Only when this phone uses its own identity service: the QR names it for the other device to check. */
  relayOrigin?: string;
  commit: (envelope: PairingEnvelope, tokens: PairingTokens | null) => Promise<void>;
  /** This phone's MLS device id on `host` once its KeyPackages are up, or null if it doesn't get one. */
  deviceOn: (host: string, signal: AbortSignal) => Promise<string | null>;
  /** How long to wait for one server before saying ready without it. */
  joinTimeoutMs?: number;
  clock?: PairingClock;
  approvalMs?: number;
}

export interface PhoneNewDeviceState {
  pairing: NewDeviceState;
  /** While joining: servers with a device up, out of how many. */
  joined: { done: number; total: number } | null;
  /** Everything is written. Whatever happens to the link after this, the phone is linked. */
  committed: boolean;
}

export interface PhoneNewDevice {
  readonly state: PhoneNewDeviceState;
  subscribe(listener: (state: PhoneNewDeviceState) => void): () => void;
  start(): void;
  cancel(): Promise<void>;
  mismatch(): Promise<void>;
}

const JOIN_TIMEOUT_MS = 90_000;

export function createPhoneNewDevice(options: PhoneNewDeviceOptions): PhoneNewDevice {
  const abort = new AbortController();
  const pairing = createNewDevicePairing({
    relay: options.relay,
    device: options.device,
    relayOrigin: options.relayOrigin,
    oidc: options.oidc,
    clock: options.clock,
    approvalMs: options.approvalMs,
    storage: { commit: options.commit },
  });
  const listeners = new Set<(state: PhoneNewDeviceState) => void>();
  let state: PhoneNewDeviceState = { pairing: pairing.state, joined: null, committed: false };
  let joining = false;

  const set = (next: Partial<PhoneNewDeviceState>) => {
    state = { ...state, ...next };
    for (const l of listeners) l(state);
  };

  async function deviceWithin(host: string): Promise<PairedServerDevice | null> {
    const own = new AbortController();
    const stop = () => own.abort();
    abort.signal.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(stop, options.joinTimeoutMs ?? JOIN_TIMEOUT_MS);
    try {
      const deviceId = await options.deviceOn(host, own.signal);
      return deviceId ? { host, deviceId } : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      abort.signal.removeEventListener("abort", stop);
    }
  }

  async function join(hosts: string[]) {
    let done = 0;
    set({ joined: { done, total: hosts.length } });
    const devices = await Promise.all(
      hosts.map(async (host) => {
        const found = await deviceWithin(host);
        if (found) set({ joined: { done: ++done, total: hosts.length } });
        return found;
      }),
    );
    if (abort.signal.aborted) return;
    // Servers left out here still get this phone later, when somebody next sends in each DM.
    await pairing.ready(devices.filter((d): d is PairedServerDevice => d !== null)).catch(() => undefined);
  }

  pairing.subscribe((next) => {
    set({ pairing: next, ...(next.phase === "joining" ? { committed: true } : {}) });
    if (next.phase === "joining" && !joining) {
      joining = true;
      void join(next.servers.map((s) => s.host));
    }
  });

  return {
    get state() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    start: () => pairing.start(),
    cancel: async () => {
      abort.abort();
      await pairing.cancel();
    },
    mismatch: async () => {
      abort.abort();
      await pairing.mismatch();
    },
  };
}
