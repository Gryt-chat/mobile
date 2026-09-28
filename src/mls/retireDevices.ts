import type { LocalArchive } from "../archive/archiveOpener";
import type { MlsSession } from "./session";

/** Refusals that mean the server has no such device, so there's nothing left to remove. */
const ALREADY_GONE = new Set(["unknown_device", "invalid_device", "device_removed"]);

/**
 * Devices whose state a clear or a lost key wiped, off the server, so peers stop encrypting
 * to a device that can't read. One that fails for another reason waits for the next connect.
 */
export async function retireOldDevices(
  session: Pick<MlsSession, "storeScope" | "removeOwnDevice">,
  archive: Pick<LocalArchive, "retiredMlsDevices" | "forgetRetiredMlsDevice" | "mlsState">,
): Promise<void> {
  const scope = session.storeScope;
  const retired = await archive.retiredMlsDevices(scope);
  if (!retired.length) return;
  const current = (await archive.mlsState(scope).loadDevice())?.deviceId;
  for (const deviceId of retired) {
    if (deviceId !== current) {
      try {
        await session.removeOwnDevice(deviceId);
      } catch (e) {
        const code = (e as { refusal?: { error?: string } })?.refusal?.error;
        if (!code || !ALREADY_GONE.has(code)) {
          console.warn("[MLS] Couldn't remove an old device:", deviceId, e);
          continue;
        }
      }
    }
    await archive.forgetRetiredMlsDevice(scope, deviceId);
  }
}
