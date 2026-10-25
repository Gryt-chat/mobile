import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Alert, Platform } from "react-native";
import type { Socket } from "socket.io-client";

import type { MlsDmContent } from "@gryt/core";
import { asIdentityScope, base64Url, comparisonCode, verifyDmKeyBinding } from "@gryt/crypto";

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
import { readAccountTokens } from "../account/tokens";
import { dmKeyBindingFor, keyHandoverFor } from "../identity/dmKeys";
import { confirmOwner } from "../pairing/ownerCheck";
import { newMlsDevice, ownPersonPublicKey, personKeyBindingFor } from "../identity/personKey";
import { identityScopeFor } from "../identity/scope";
import { noteArchived } from "../pairing/activeApprover";
import { checkOwnDevices } from "../pairing/deviceNotices";
import type { DeviceNotice } from "../pairing/newDeviceNotice";
import { publishDmKey } from "../connection/publishDmKey";
import { useServerMlsCapability } from "./capability";
import { createModeOnlySource } from "./modeOnly";
import { publishMlsSource } from "./registry";
import {
  authTimeOf,
  clearRemovedHere,
  markRemovedHere,
  onRemovedCleared,
  removedHereAt,
  removedSource,
  stillRemoved,
} from "./removedHere";
import { retireOldDevices } from "./retireDevices";
import { seenOnMlsFor } from "./seenOnMls";
import { createMlsSession, type MlsSession, type SessionSocket } from "./session";
import { publishPersonKey } from "./publishPersonKey";

/** How long to wait for the member list before starting anyway. */
const MEMBERS_WAIT_MS = 5000;

/* iOS only gives the user's own device name to apps with an entitlement, so the model it is. */
function deviceName(): string {
  if (Platform.OS === "ios") return Platform.isPad ? "iPad" : "iPhone";
  return (Platform.constants as { Model?: string }).Model || "Android phone";
}
const DEVICE_NAME = deviceName();

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

function ownDevicesCheck(host: string, scope: string, session: MlsSession, onNew?: (notice: DeviceNotice) => void) {
  return { host, scope, list: () => session.ownDevices(), onNew };
}

/* "Use this phone's key instead" asks the server to take this phone's key, then starts again. */
const rekeys = new Map<string, () => Promise<boolean>>();
export function adoptThisPhonesKey(host: string): Promise<boolean> {
  return rekeys.get(host)?.() ?? Promise.resolve(false);
}

/* Asked once per launch (GRYT-1874): the phone has its own key and never registered, so it
   waits to be approved instead of quietly becoming a second you. Starting fresh stays in the DM. */
let askedToApprove = false;
function askToApprove(socket: Socket, dmScope: string): void {
  if (askedToApprove) return;
  askedToApprove = true;
  Alert.alert(
    "Approve this phone",
    "Your account already has an encryption key on another device. Approve this phone from there, and your encrypted messages work here too.",
    [
      { text: "Not now", style: "cancel" },
      { text: "I have my 24 words", onPress: () => router.push("/identity") },
      { text: "Lost everything?", onPress: () => confirmReset(socket, dmScope) },
      { text: "Approve from another device", onPress: () => router.push("/link-from-device") },
    ],
  );
}

/** No device and no words (GRYT-1886): this phone's key takes over in 30 days, unless one of yours stops it. */
function confirmReset(socket: Socket, dmScope: string): void {
  Alert.alert(
    "Reset your key?",
    "Only if you've lost every device and your 24 words. This phone's key takes over in 30 days. Your devices can stop it until then, so a thief with your password can't do this quietly. Old messages won't come over.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset my key",
        style: "destructive",
        onPress: () =>
          void dmKeyBindingFor(dmScope).then((binding) =>
            socket.emit("dm:key:reset:request", { binding }, (reply: { ok?: boolean; at?: number }) =>
              reply?.ok && reply.at
                ? Alert.alert("Reset requested", `Your key resets on ${new Date(reply.at).toLocaleDateString()}, unless one of your devices stops it.`)
                : Alert.alert("That didn't go through", "Try again in a moment."),
            ),
          ),
      },
    ],
  );
}

/* Reset prompts already shown this launch, by server and time, so a member list doesn't repeat them. */
const shownResets = new Set<string>();

/** The phone holding the current key can stop a reset; the phone that asked takes over when it's due. */
function noteKeyReset(socket: Socket, host: string, dmScope: string, at: number | null, holdsCurrentKey: boolean, current: string | null): void {
  if (!at) return;
  if (!holdsCurrentKey) {
    if (at <= Date.now()) void adoptThisPhonesKey(host);
    return;
  }
  if (shownResets.has(`${host}:${at}`) || !current) return;
  shownResets.add(`${host}:${at}`);
  Alert.alert(
    "Someone asked to reset your key",
    `On ${host}, a device asked to replace your key. It takes over on ${new Date(at).toLocaleDateString()} unless you stop it. If it wasn't you, stop it and change your password.`,
    [
      { text: "It was me", style: "cancel" },
      {
        text: "It wasn't me, stop it",
        style: "destructive",
        onPress: () =>
          void keyHandoverFor(dmScope, current).then((proof) =>
            socket.emit("dm:key:reset:cancel", { proof }, (reply: { ok?: boolean }) =>
              Alert.alert(reply?.ok ? "Stopped" : "That didn't go through", reply?.ok ? "Your key stays as it is." : "Try again in a moment."),
            ),
          ),
      },
    ],
  );
}

/* Per server, whether the account's key there is this phone's. Kept across server switches. */
const keyMatches = new Map<string, boolean>();

/**
 * This phone's key is already the account's on another server, so this one should follow: ask the
 * device holding its key to hand it over, and show the code it will show.
 */
async function askOtherDevice(socket: Socket, host: string, dmScope: string, accountBinding: string): Promise<void> {
  const binding = await dmKeyBindingFor(dmScope);
  const code = await handoverCode(dmScope, accountBinding, binding).catch(() => null);
  socket.emit("dm:key:handover:ask", { binding, deviceName: Platform.OS === "ios" ? "iPhone" : "Android phone" });
  socket.once("dm:key:handover:denied", () =>
    Alert.alert("Your other device said no", "Nothing changed. If that was a mistake, approve this phone from another device.", [
      { text: "OK", style: "cancel" },
      { text: "Approve from another device", onPress: () => router.push("/link-from-device") },
    ]),
  );
  Alert.alert(
    "Approve on your other device",
    `Your other device has a request from this phone. Open Gryt there and check it shows ${code ?? "the same code"}, then approve. ${host} then uses the same key as your other servers.`,
  );
}

type HandoverSocket = { emit: (event: string, payload: unknown, ack?: (reply: { ok?: boolean }) => void) => unknown };

/** The same eight digits the asking device shows: from this phone's binding and the new one. */
async function handoverCode(dmScope: string, mine: string, theirs: string): Promise<string> {
  const scope = asIdentityScope(dmScope);
  const side = async (binding: string) => {
    const v = await verifyDmKeyBinding(binding, scope);
    return { thumbprint: v.identityThumbprint, dmPublicKey: base64Url(v.dmPublicKey) };
  };
  const digits = comparisonCode(await side(mine), await side(theirs));
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)}`;
}

/** "Is this your Mac?": Approve signs the server over to it with this phone's key, No tells it so. */
async function askToHandOver(socket: HandoverSocket, host: string, dmScope: string, binding: string, askerId: string, deviceName: string) {
  const code = await handoverCode(dmScope, await dmKeyBindingFor(dmScope), binding).catch(() => null);
  if (!code) return;
  Alert.alert(
    `Is this your ${deviceName}?`,
    `It wants ${host} to use the same key as your other servers. Only approve it if you're holding it right now.\n\nDoes it show ${code}?`,
    [
      { text: "No, that's not mine", style: "cancel", onPress: () => socket.emit("dm:key:handover:deny", { askerId }) },
      {
        text: "Yes, approve",
        onPress: () =>
          void (async () => {
            // Face ID or the passcode first, as for linking: someone holding your unlocked phone can't approve.
            if ((await confirmOwner(deviceName)) === "refused") return;
            const handover = await keyHandoverFor(dmScope, binding);
            socket.emit("dm:key:publish", { binding, replace: true, handover }, (reply) => {
              if (reply?.ok !== true) Alert.alert("That didn't go through", "Ask again from the other device.");
            });
          })(),
      },
    ],
  );
}

/** A phone with its own key: says so on every DM, and sends nothing new on MLS unless it was already in. */
function otherIdentitySource(base: MlsSession, registered: boolean): MlsSession {
  const refused = { kind: "refused", reason: "no_own_device" } as const;
  return {
    ...base,
    problems: (conversationId) => {
      const problems = base.problems(conversationId);
      return problems.lost ? problems : { ...problems, lost: "other_identity" };
    },
    ...(registered
      ? {}
      : {
          modeFor: async (conversationId: string, peer: string) => {
            const mode = await base.modeFor(conversationId, peer).catch(() => refused);
            return mode.kind === "sealed-v1" ? mode : refused;
          },
          send: () =>
            Promise.reject(Object.assign(new Error("This phone has its own key here. Link it first."), { code: "other_identity" })),
        }),
  };
}

/** Wiped again on every start while it holds, so a crash between marking and wiping leaves nothing. */
async function stillRemovedHere(scope: string, archive: LocalArchive): Promise<boolean> {
  const at = await removedHereAt(scope);
  if (at === null) return false;
  if (!stillRemoved(at, authTimeOf((await readAccountTokens())?.accessToken))) {
    await clearRemovedHere(scope);
    return false;
  }
  await archive.wipeServer(scope);
  return true;
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
  onNewOwnDevice,
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
  /** One of your own devices showed up here that this phone didn't link, for a toast (GRYT-1576). */
  onNewOwnDevice?: (notice: DeviceNotice) => void;
}): void {
  const advertised = useServerMlsCapability(host);
  // A server that never sends `server:info` has no MLS; the driver still answers modeFor.
  const capability = advertised ?? null;
  const [session, setSession] = useState<MlsSession | null>(null);
  const [dmScope, setDmScope] = useState<string | null>(null);
  // A clear hands every session a new archive, so each one starts again on it.
  const { epoch: archiveEpoch } = useLocalArchive();
  // Goes up when the server removes this phone, so the session gives way to the removed source.
  const [removals, setRemovals] = useState(0);
  const [rekeyed, setRekeyed] = useState(0);
  useEffect(() => onRemovedCleared(() => setRemovals((n) => n + 1)), []);

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
      const modeOnly = createModeOnlySource({
        socket: socket as unknown as SessionSocket,
        storeScope,
        dmScope: scope,
        serverUserId,
        capability,
        getAccessToken,
        seen: seenOnMlsFor(scope),
      });
      publishMlsSource(host, modeOnly);
      if (!capability) return;

      const waiting = whenArchiveOpens();
      stopWaiting = waiting.stop;
      const archive = await waiting.archive;
      if (await stillRemovedHere(storeScope, archive)) {
        if (live) publishMlsSource(host, removedSource(modeOnly));
        return;
      }
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
        onDeviceRemoved: () => {
          void markRemovedHere(storeScope).then(() => setRemovals((n) => n + 1));
        },
        onArchived: (archived) => noteArchived(host, archived),
        onOwnDevicesChanged: () => {
          if (made) void checkOwnDevices(ownDevicesCheck(host, storeScope, made, onNewOwnDevice));
        },
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
  }, [host, socket, ready, serverUserId, capability, getAccessToken, archiveEpoch, removals]);

  useEffect(() => {
    if (!socket || !online || !session || !dmScope || !serverUserId || !session.capability) return;
    let live = true;

    // Pins first: a Welcome from somebody whose person key isn't pinned is thrown away.
    let pinnedOnce: () => void = () => {};
    const pinned = new Promise<void>((resolve) => {
      pinnedOnce = resolve;
      setTimeout(resolve, MEMBERS_WAIT_MS);
    });
    // Your account's key here isn't this phone's (GRYT-1868): it links instead of registering.
    let otherIdentity = false;
    let accountBinding: string | null = null;
    const listed = (members: Member[]) => {
      if (!Array.isArray(members)) return;
      const own = members.find((m) => m.serverUserId === serverUserId);
      accountBinding = own?.dmKeyBinding ?? null;
      void evaluateMobileMemberKeys({ host, members, myServerUserId: serverUserId })
        .then((states) => {
          const mine = states[serverUserId];
          otherIdentity = !!(mine?.ownKeyRewritten || mine?.ownPersonKeyRewritten);
          keyMatches.set(host, !otherIdentity);
          noteKeyReset(socket, host, dmScope, own?.keyResetAt ?? null, !otherIdentity, accountBinding);
        })
        .catch(() => undefined)
        .then(() => pinnedOnce());
    };
    rekeys.set(host, async () => {
      const ok = await publishDmKey(socket, host, { replace: true });
      if (ok) setRekeyed((n) => n + 1);
      return ok;
    });
    // Another device asks this phone, which holds the account's key, to hand the server over (GRYT-1886).
    const asked = (request: { binding?: string; deviceName?: string; askerId?: string }) => {
      const { binding, askerId } = request ?? {};
      if (otherIdentity || typeof binding !== "string" || typeof askerId !== "string") return;
      void askToHandOver(socket, host, dmScope, binding, askerId, request.deviceName || "A new device");
    };
    socket.on("members:list", listed);
    socket.on("dm:key:handover:asked", asked);
    socket.emit("members:fetch");

    void (async () => {
      const accessToken = await getAccessToken();
      if (!live || !accessToken) return;
      socket.emit("dm:list", { accessToken });
      await pinned;
      if (!live) return;
      const archive = await openLocalArchive();
      if (otherIdentity) {
        // Registered before this rule: it keeps the DMs it's in. Never registered: it waits to be linked.
        const registered = (await archive.mlsState(session.storeScope).loadDevice()) !== null;
        publishMlsSource(host, otherIdentitySource(session, registered));
        if (!registered) {
          const matchesElsewhere = [...keyMatches].some(([other, ok]) => other !== host && ok);
          if (matchesElsewhere && accountBinding) await askOtherDevice(socket, host, dmScope, accountBinding);
          else askToApprove(socket, dmScope);
          return;
        }
      } else {
        publishMlsSource(host, session);
        await publishPersonKey(socket, accessToken, await personKeyBindingFor(dmScope));
        // Opened from an "approve" push, or just connected: requests made while away come now.
        socket.emit("dm:key:handover:pending", {});
      }
      // Never holds up the start: a device left behind is tried again on the next connect.
      await retireOldDevices(session, archive).catch((e: unknown) => console.warn("[MLS] Retiring old devices failed:", e));
      if (!live) return;
      await session.start();
      if (live) void checkOwnDevices(ownDevicesCheck(host, session.storeScope, session, onNewOwnDevice));
    })().catch((e: unknown) => console.warn("[MLS] Couldn't start:", e));

    return () => {
      live = false;
      socket.off("members:list", listed);
      socket.off("dm:key:handover:asked", asked);
      rekeys.delete(host);
    };
  }, [host, socket, online, session, dmScope, serverUserId, getAccessToken, rekeyed]);
}
