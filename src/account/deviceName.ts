import { sealDeviceName } from "@gryt/crypto";
import { Platform } from "react-native";

import { getOrCreateSeed } from "../identity/seed";

/* iOS only gives the user's own device name to apps with an entitlement, so the model it is. */
export function deviceName(): string {
  if (Platform.OS === "ios") return Platform.isPad ? "iPad" : "iPhone";
  return (Platform.constants as { Model?: string }).Model || "Android phone";
}

/** The name sealed with the seed, so only your own devices can read it. Undefined if sealing fails. */
export async function sealedDeviceName(): Promise<string | undefined> {
  try {
    return sealDeviceName(await getOrCreateSeed(), deviceName());
  } catch {
    return undefined;
  }
}
