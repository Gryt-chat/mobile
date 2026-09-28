import { useEffect, useState } from "react";
import { Platform } from "react-native";
import type { Socket } from "socket.io-client";

import type { MlsDmContent } from "@gryt/core";

import { openLocalArchive } from "../archive/localArchive";
import { evaluateMobileMemberKeys } from "../connection/memberKeys";
import { peerPinStore } from "../connection/peerPins";
import { dmScopeFor } from "../connection/pins";
import type { Member } from "../connection/types";
import { newMlsDevice, ownPersonPublicKey, personKeyBindingFor } from "../identity/personKey";
import { identityScopeFor } from "../identity/scope";
import { useServerMlsCapability } from "./capability";
import { publishMlsSession } from "./registry";
import { seenOnMlsFor } from "./seenOnMls";
import { createMlsSession, type MlsSession, type SessionSocket } from "./session";
import { publishPersonKey } from "./publishPersonKey";

/** How long to wait for the member list before starting anyway. */
const MEMBERS_WAIT_MS = 5000;

const DEVICE_NAME = Platform.OS === "ios" ? "iPhone" : "Android phone";

/** A session being closed, per host. The next one waits for it, so two drivers never share a store. */
const retiring = new Map<string, Promise<void>>();

/**
 * MLS for one server: a session while signed in there, and on every connect, pin the member
 * list's person keys, publish ours and catch up. The DM screen reads the session.
 */
export function useServerMls({
  host,
  socket,
  online,
  ready,
  serverUserId,
  getAccessToken,
  onDelivered,
}: {
  host: string;
  socket: Socket | null;
  online: boolean;
  ready: boolean;
  serverUserId: string | null;
  getAccessToken: () => Promise<string | null>;
  /** A live message from somebody else, once archived — for a toast and a sound. */
  onDelivered?: (message: {
    conversationId: string;
    senderId: string;
    content: Extract<MlsDmContent, { type: "message" }> | null;
  }) => void;
}): void {
  const advertised = useServerMlsCapability(host);
  // A server that never sends `server:info` has no MLS; the driver still answers modeFor.
  const capability = advertised ?? null;
  const [session, setSession] = useState<MlsSession | null>(null);
  const [dmScope, setDmScope] = useState<string | null>(null);

  useEffect(() => {
    if (!socket || !ready || !serverUserId) return;
    let live = true;
    let made: MlsSession | null = null;

    void (async () => {
      await retiring.get(host);
      const [archive, scope] = await Promise.all([openLocalArchive(), dmScopeFor(host)]);
      const storeScope = identityScopeFor(host);
      const ownPersonKey = await ownPersonPublicKey(scope);
      if (!live) return;

      made = createMlsSession({
        socket: socket as unknown as SessionSocket,
        storeScope,
        dmScope: scope,
        serverUserId,
        capability,
        getAccessToken,
        messages: archive.messages,
        store: archive.mlsState(storeScope),
        pinStore: peerPinStore,
        seen: seenOnMlsFor(scope),
        ownPersonKey,
        newDevice: () => newMlsDevice(scope, DEVICE_NAME),
        onDelivered,
      });
      publishMlsSession(host, made);
      setDmScope(scope);
      setSession(made);
    })().catch((e: unknown) => console.warn("[MLS] Couldn't open:", e));

    return () => {
      live = false;
      setSession(null);
      if (!made) return;
      publishMlsSession(host, null);
      retiring.set(host, made.dispose());
    };
    // A stable ref-backed callback; naming it here would recreate the session on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, socket, ready, serverUserId, capability, getAccessToken]);

  useEffect(() => {
    if (!socket || !online || !session || !dmScope || !serverUserId || !session.capability) return;
    let live = true;

    // Pins first: a Welcome from somebody whose person key isn't pinned is thrown away.
    let pinnedOnce: () => void = () => {};
    const pinned = new Promise<void>((resolve) => {
      pinnedOnce = resolve;
      setTimeout(resolve, MEMBERS_WAIT_MS);
    });
    const listed = (members: Member[]) => {
      if (!Array.isArray(members)) return;
      void evaluateMobileMemberKeys({ host, members, myServerUserId: serverUserId })
        .catch(() => undefined)
        .then(() => pinnedOnce());
    };
    socket.on("members:list", listed);
    socket.emit("members:fetch");

    void (async () => {
      const accessToken = await getAccessToken();
      if (!live || !accessToken) return;
      socket.emit("dm:list", { accessToken });
      await publishPersonKey(socket, accessToken, await personKeyBindingFor(dmScope));
      await pinned;
      if (live) await session.start();
    })().catch((e: unknown) => console.warn("[MLS] Couldn't start:", e));

    return () => {
      live = false;
      socket.off("members:list", listed);
    };
  }, [host, socket, online, session, dmScope, serverUserId, getAccessToken]);
}
