import { createPairingRelay, type PairingFetch } from "@gryt/core";

import { accountConfig } from "../account/config";

/** React Native's fetch, typed down to what pairing asks of it. */
export const pairingFetch: PairingFetch = (url, init) => fetch(url, init);

/** The relay this phone trusts: its own identity service, never one a QR names. */
export function phoneRelay() {
  const origin = accountConfig().identityUrl;
  return { origin, relay: createPairingRelay(origin, pairingFetch) };
}
