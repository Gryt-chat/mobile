import AsyncStorage from "@react-native-async-storage/async-storage";

import { getLocalIdentity } from "../identity/localIdentity";
import { ACCOUNT } from "./config";
import {
  isUsable,
  requestCertificate,
  subjectOf,
  type StoredCertificate,
} from "./certificate";

/**
 * The account certificate for this device, fetched when there is not a usable
 * one already.
 *
 * In AsyncStorage rather than the Keychain, and the distinction is the same one
 * the pins are on: a certificate is not a credential. It says a Gryt account
 * holds a particular public key, and it is worthless without the private key
 * that key belongs to — which *is* in the Keychain. What matters is that
 * nothing but this app can change it, which AsyncStorage gives.
 */
const KEY = "gryt.account.certificate";

async function readStored(): Promise<StoredCertificate | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as StoredCertificate).certificate === "string" &&
      typeof (parsed as StoredCertificate).expiresAt === "number"
    ) {
      return parsed as StoredCertificate;
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearCertificate(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Losing it costs a fetch.
  }
}

/**
 * A certificate proving this device's key belongs to the signed-in account.
 *
 * Returns null when there is no account, rather than throwing — not being
 * signed in is an ordinary state and every caller has a local identity to fall
 * back to.
 *
 * `host` only chooses which device key is used. The certificate is per key,
 * not per server: the same one is presented everywhere, which is the point of
 * having an account.
 */
export async function getAccountCertificate(
  host: string,
  accessToken: string | null,
): Promise<{ certificate: string; sub: string } | null> {
  if (!accessToken) return null;

  const identity = await getLocalIdentity(host);
  const stored = await readStored();

  if (isUsable(stored, identity.publicJwk)) {
    const sub = subjectOf(stored!.certificate);
    if (sub) return { certificate: stored!.certificate, sub };
  }

  const fresh = await requestCertificate({
    identityUrl: ACCOUNT.identityUrl,
    accessToken,
    publicJwk: identity.publicJwk,
  });

  const sub = subjectOf(fresh.certificate);
  if (!sub) return null;

  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(fresh));
  } catch {
    // Works for this run; it just will not survive a restart.
  }

  return { certificate: fresh.certificate, sub };
}
