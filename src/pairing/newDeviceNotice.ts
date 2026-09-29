import type { MlsAddOwnDeviceOptions, MlsGroupPosition, MlsOwnDevice, MlsOwnDeviceAdd } from "@gryt/core";

/* "New device linked" on your other devices (GRYT-1576). The desktop says the same (GRYT-1583).
   Pure, so the tests can walk it through a baseline, a new device and one this phone linked. */

export interface DeviceNotice {
  /** The server scope the device list came from, and the host to show it under. */
  scope: string;
  host: string;
  deviceId: string;
  name: string | null;
  /** When the server says it was added, or when this phone noticed. Milliseconds. */
  at: number;
}

/**
 * Which devices are new against those already known. With nothing known yet this is the first
 * look at this server: everything becomes known and nothing is new. `linkedHere` never is.
 */
export function diffOwnDevices(
  known: readonly string[] | null,
  devices: readonly MlsOwnDevice[],
  linkedHere: readonly string[] = [],
): { fresh: MlsOwnDevice[]; known: string[] } {
  const all = new Set(known ?? []);
  for (const d of devices) all.add(d.deviceId);
  if (known === null) return { fresh: [], known: [...all] };
  const skip = new Set([...known, ...linkedHere]);
  return { fresh: devices.filter((d) => !d.thisDevice && !skip.has(d.deviceId)), known: [...all] };
}

export function noticeFor(scope: string, host: string, device: MlsOwnDevice, now: number): DeviceNotice {
  const added = device.addedAt ? Date.parse(device.addedAt) : NaN;
  return { scope, host, deviceId: device.deviceId, name: device.name, at: Number.isFinite(added) ? added : now };
}

/** The same fallback the device list uses for a device with no certificate here yet. */
const label = (name: string | null) => name ?? "Another device";

/** The toast, when it happens. */
export function newDeviceToastText(name: string | null): string {
  return `New device linked: ${label(name)}. Not you? Remove it.`;
}

/** The line that stays in Security until it's dismissed. */
export function newDeviceItemText(notice: DeviceNotice, when: (at: number) => string): string {
  return `New device linked: ${label(notice.name)}, ${when(notice.at)}. Not you? Remove it.`;
}

/** One notice per device id per scope, the newest first. */
export function addNotices(existing: readonly DeviceNotice[], fresh: readonly DeviceNotice[]): DeviceNotice[] {
  const key = (n: DeviceNotice) => `${n.scope} ${n.deviceId}`;
  const seen = new Set(existing.map(key));
  const added = fresh.filter((n) => !seen.has(key(n)));
  return [...added, ...existing].sort((a, b) => b.at - a.at);
}

type Adder = {
  addOwnDevice(deviceId: string, options?: MlsAddOwnDeviceOptions): Promise<MlsOwnDeviceAdd[]>;
  groupPositions(): Promise<MlsGroupPosition[]>;
};

/** The adder core calls, marking each device known before it's added, so linking it raises no notice here. */
export function adderMarkingKnown(
  sessionOn: (host: string) => Adder | undefined,
  scopeFor: (host: string) => string,
  markKnown: (scope: string, ids: string[]) => Promise<void>,
): (host: string) => Adder | undefined {
  return (host) => {
    const session = sessionOn(host);
    if (!session) return undefined;
    return {
      async addOwnDevice(deviceId, options) {
        await markKnown(scopeFor(host), [deviceId]);
        return session.addOwnDevice(deviceId, options);
      },
      groupPositions: () => session.groupPositions(),
    };
  };
}
