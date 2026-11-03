import AsyncStorage from "@react-native-async-storage/async-storage";

import { decodeJwt } from "../connection/claims";
import type { PublicJwk } from "../identity/keys";
import { getLocalIdentity } from "../identity/localIdentity";
import { getOrCreateSeed } from "../identity/seed";
import { accountConfig } from "./config";
import {
  accountKeyJwk,
  ApprovalRequiredError,
  isUsable,
  requestCertificate,
  seedProof,
  subjectOf,
  type StoredCertificate,
} from "./certificate";

/**
 * The account certificate for this device. **In AsyncStorage rather than the Keychain,
 * because a certificate is not a credential** — it is worthless without the key.
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

const approvalListeners = new Set<(resetAt: number | null) => void>();

/** Called when the identity service wants this sign-in approved from another device. */
export function onApprovalRequired(fn: (resetAt: number | null) => void): () => void {
  approvalListeners.add(fn);
  return () => approvalListeners.delete(fn);
}

/** The identity service's view of this phone's seed key: on record, and any reset under way. */
export async function accountKeyCall(
  path: "status" | "reset" | "reset/cancel",
  accessToken: string,
): Promise<{ known?: boolean; resetAt?: number | null; resetIsYours?: boolean; at?: number | null; ok?: boolean } | null> {
  try {
    const jwk = accountKeyJwk(await getOrCreateSeed());
    const proof = await proofFor(accessToken, jwk);
    if (!proof) return null;
    const res = await fetch(`${accountConfig().identityUrl.replace(/\/+$/, "")}/api/v1/account-key/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ jwk, proof }),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function proofFor(accessToken: string, certJwk: PublicJwk): Promise<string | undefined> {
  const sub = decodeJwt<{ sub?: unknown }>(accessToken)?.sub;
  if (typeof sub !== "string") return undefined;
  try {
    return seedProof(await getOrCreateSeed(), sub, certJwk);
  } catch {
    return undefined;
  }
}

/**
 * A certificate proving this device's key belongs to the signed-in account. Null rather
 * than throwing. **`host` only chooses which device key is used.**
 */
export async function getAccountCertificate(
  host: string,
  accessToken: string | null,
): Promise<{ certificate: string; sub: string } | null> {
  if (!accessToken) return null;

  const identity = await getLocalIdentity(host);
  const stored = await readStored();

  if (stored && isUsable(stored, identity.publicJwk)) {
    const sub = subjectOf(stored.certificate);
    if (sub) return { certificate: stored.certificate, sub };
  }

  const fresh = await requestCertificate({
    identityUrl: accountConfig().identityUrl,
    accessToken,
    publicJwk: identity.publicJwk,
    proof: await proofFor(accessToken, identity.publicJwk),
  }).catch((err: unknown) => {
    if (err instanceof ApprovalRequiredError) for (const fn of approvalListeners) fn(err.resetAt);
    throw err;
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
