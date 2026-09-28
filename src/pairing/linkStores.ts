import { DEFAULT_IDENTITY_URL, DEFAULT_ISSUER, normalizeAuthUrl } from "../account/authServer";
import { setAuthOverride } from "../account/config";
import type { AccountTokens } from "../account/tokens";
import { hydratePeerPins, peerPinStore } from "../connection/peerPins";
import { writeLinkedScopes } from "../identity/linkedScopes";
import { restoreSeed } from "../identity/seed";
import { waitForMlsSession } from "../mls/registry";
import { seenOnMlsFor } from "../mls/seenOnMls";
import { normalizeHost, restoreScheme } from "../servers/address";
import type { LinkStores } from "./commit";

/** The phone's own stores behind `commitLink`. The two React-held ones come in from the screen. */
export function phoneLinkStores(react: {
  adoptTokens: (tokens: AccountTokens) => Promise<void>;
  join: (host: string, info: { name: string }) => Promise<void>;
  recordNickname: (host: string, nickname: string) => Promise<void>;
}): LinkStores {
  return {
    async setAuthServer(issuer, identityUrl) {
      const own = (url: string, fallback: string) => (normalizeAuthUrl(url) === fallback ? null : url);
      await setAuthOverride({ issuer: own(issuer, DEFAULT_ISSUER), identityUrl: own(identityUrl, DEFAULT_IDENTITY_URL) });
    },
    restoreSeed,
    writeScopes: writeLinkedScopes,
    async mergePins(pins) {
      await hydratePeerPins();
      peerPinStore.write({ ...peerPinStore.read(), ...pins });
    },
    markSeenOnMls: (scope, member) => seenOnMlsFor(scope).add(member),
    adoptTokens: react.adoptTokens,
    async addServer({ host, name, nickname, scheme }) {
      const normalized = normalizeHost(host);
      if (scheme) restoreScheme(normalized, scheme);
      await react.join(normalized, { name });
      if (nickname) await react.recordNickname(normalized, nickname);
    },
  };
}

/** This phone's MLS device on `host`, once the session there has started and published. */
export async function mlsDeviceOn(host: string, signal: AbortSignal): Promise<string | null> {
  const session = await waitForMlsSession(normalizeHost(host), signal);
  await session.start();
  const devices = await session.ownDevices();
  return devices.find((d) => d.thisDevice)?.deviceId ?? null;
}
