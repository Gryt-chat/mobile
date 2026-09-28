import { useEffect, useState } from "react";
import { Platform } from "react-native";
import type { Socket } from "socket.io-client";

import type { MlsDmContent } from "@gryt/core";

import {
  getLocalArchiveSnapshot,
  type LocalArchive,
  openLocalArchive,
  subscribeToLocalArchive,
  useLocalArchive,
} from "../archive/localArchive";
import { evaluateMobileMemberKeys } from "../connection/memberKeys";
import { peerPinStore } from "../connection/peerPins";
import { dmScopeFor } from "../connection/pins";
import type { Member } from "../connection/types";
import { newMlsDevice, ownPersonPublicKey, personKeyBindingFor } from "../identity/personKey";
import { identityScopeFor } from "../identity/scope";
import { useServerMlsCapability } from "./capability";
import { createModeOnlySource } from "./modeOnly";
import { publishMlsSource } from "./registry";
import { retireOldDevices } from "./retireDevices";
import { seenOnMlsFor } from "./seenOnMls";
import { createMlsSession, type MlsSession, type SessionSocket } from "./session";
import { publishPersonKey } from "./publishPersonKey";

/** How long to wait for the member list before starting anyway. */
const MEMBERS_WAIT_MS = 5000;

const DEVICE_NAME = Platform.OS === "ios" ? "iPhone" : "Android phone";

/** A session being closed, per host. The next one waits for it, so two drivers never share a store. */
const retiring = new Map<string, Promise<void>>();

/** The archive, now or once Try again or a clear opens it. `stop` gives up waiting. */
function whenArchiveOpens(): { archive: Promise<LocalArchive>; stop: () => void } {
  let stop = () => {};
  const archive = openLocalArchive().catch(
    () =>
      new Promise<LocalArchive>((resolve) => {
        const off = subscribeToLocalArchive(() => {
          if (getLocalArchiveSnapshot().status.kind !== "open") return;
          off();
          resolve(openLocalArchive());
        });
        stop = off;
      }),
  );
  return { archive, stop: () => stop() };
}

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
  // A clear hands every session a new archive, so each one starts again on it.
  const { epoch: archiveEpoch } = useLocalArchive();

  useEffect(() => {
    if (!socket || !ready || !serverUserId) return;
    let live = true;
    let made: MlsSession | null = null;
    let stopWaiting = () => {};

    void (async () => {
      await retiring.get(host);
      const scope = await dmScopeFor(host);
      const storeScope = identityScopeFor(host);
      if (!live) return;

      // Version 1 needs no archive, so DMs that don't need MLS go on while it opens or if it won't.
      publishMlsSource(
        host,
        createModeOnlySource({
          socket: socket as unknown as SessionSocket,
          storeScope,
          dmScope: scope,
          serverUserId,
          capability,
          getAccessToken,
          seen: seenOnMlsFor(scope),
        }),
      );
      if (!capability) return;

      const waiting = whenArchiveOpens();
      stopWaiting = waiting.stop;
      const archive = await waiting.archive;
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
      publishMlsSource(host, made);
      setDmScope(scope);
      setSession(made);
    })().catch((e: unknown) => console.warn("[MLS] Couldn't open:", e));

    return () => {
      live = false;
      stopWaiting();
      setSession(null);
      publishMlsSource(host, null);
      if (made) retiring.set(host, made.dispose());
    };
    // A stable ref-backed callback; naming it here would recreate the session on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, socket, ready, serverUserId, capability, getAccessToken, archiveEpoch]);

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
      // Never holds up the start: a device left behind is tried again on the next connect.
      await retireOldDevices(session, await openLocalArchive()).catch((e: unknown) =>
        console.warn("[MLS] Retiring old devices failed:", e),
      );
      await pinned;
      if (live) await session.start();
    })().catch((e: unknown) => console.warn("[MLS] Couldn't start:", e));

    return () => {
      live = false;
      socket.off("members:list", listed);
    };
  }, [host, socket, online, session, dmScope, serverUserId, getAccessToken]);
}
