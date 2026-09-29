import * as LocalAuthentication from "expo-local-authentication";

import type { OwnerCheck } from "./approver";

/** Face ID, Touch ID or the passcode before the seed leaves this phone. A phone with no lock has nothing to ask. */
export async function confirmOwner(deviceName: string): Promise<OwnerCheck> {
  const level = await LocalAuthentication.getEnrolledLevelAsync().catch(() => LocalAuthentication.SecurityLevel.NONE);
  if (level === LocalAuthentication.SecurityLevel.NONE) return "none";
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: `Link ${deviceName}`,
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
  }).catch(() => ({ success: false as const }));
  return result.success ? "ok" : "refused";
}
