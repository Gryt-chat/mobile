import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  asIdentityScope,
  base64Url,
  comparisonCode,
  markPeerCompared,
  type PeerKeyDecision,
  type PeerPin,
  pinPeerKey,
} from "@gryt/crypto";

import { ownDmPublicKey } from "../identity/dmKeys";
import { deriveLocalKeyPair, jwkThumbprint } from "../identity/keys";
import { getOrCreateSeed } from "../identity/seed";
import { peerPinStore } from "./peerPins";
import { dmScopeFor } from "./pins";

/* Somebody's key changed and nobody has said it's them yet (GRYT-1877). Nothing is encrypted to
   the new key until somebody does: the MLS driver only trusts pinned person keys. */

type Changed = Extract<PeerKeyDecision, { kind: "changed" }>;

const newKeysOf = (d: Changed) => ({
  thumbprint: d.verified.identityThumbprint,
  dmPublicKey: base64Url(d.verified.dmPublicKey),
});

/** The safety code for their new key, as both sides read it out. Same as the desktop card. */
export async function newKeyCode(host: string, decision: Changed): Promise<string> {
  const scope = await dmScopeFor(host);
  const seed = await getOrCreateSeed();
  const own = {
    thumbprint: jwkThumbprint(deriveLocalKeyPair(seed, scope).publicJwk),
    dmPublicKey: base64Url(await ownDmPublicKey(scope)),
  };
  return comparisonCode(own, newKeysOf(decision));
}

/** "It's them": pins the new key as compared. Returns the old pin, which is what undo puts back. */
export async function trustNewKey(host: string, memberId: string, decision: Changed): Promise<PeerPin> {
  const scope = asIdentityScope(await dmScopeFor(host));
  pinPeerKey(peerPinStore, scope, memberId, decision.verified);
  markPeerCompared(peerPinStore, scope, memberId, newKeysOf(decision));
  return decision.pin;
}

/** Undo "It's them": the old pin is back, so the new key reads as changed again. */
export async function undoTrust(host: string, memberId: string, previous: PeerPin): Promise<void> {
  const scope = await dmScopeFor(host);
  peerPinStore.write({ ...peerPinStore.read(), [`${scope} ${memberId}`]: previous });
}

const notThemKey = async (host: string, memberId: string, d: Changed) =>
  `gryt.keyChange.notThem:${await dmScopeFor(host)} ${memberId} ${d.verified.identityThumbprint}`;

/** "It's not them", kept per new key, so a different key asks again. Messages stay paused either way. */
export async function setNotThem(host: string, memberId: string, d: Changed, notThem: boolean): Promise<void> {
  const key = await notThemKey(host, memberId, d);
  await (notThem ? AsyncStorage.setItem(key, "1") : AsyncStorage.removeItem(key)).catch(() => undefined);
}

export async function isNotThem(host: string, memberId: string, d: Changed): Promise<boolean> {
  return (await AsyncStorage.getItem(await notThemKey(host, memberId, d)).catch(() => null)) === "1";
}
