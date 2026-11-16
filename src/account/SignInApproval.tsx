import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Alert } from "react-native";

import { youPage } from "../shell/twoPane";
import { useGrytAccount } from "./AccountProvider";
import { deviceName } from "./deviceName";
import { accountKeyCall, keyDropped, onApprovalRequired } from "./store";

const ASK_AGAIN_MS = 10 * 60 * 1000;

const day = (at: number) => new Date(at).toLocaleDateString();

/**
 * Signing in needs a device that already has your key (GRYT-2016): this phone gets linked, restored
 * from the words, or reset over 30 days. A phone that has the key is told about somebody else's reset.
 */
export function SignInApproval() {
  const { state, getAccessToken } = useGrytAccount();
  const askedAt = useRef(0);
  const sub = state.status === "signedIn" ? state.profile.sub : null;

  useEffect(
    () =>
      onApprovalRequired((resetAt) => {
        // Every server join asks for a certificate, so one refusal arrives several times.
        if (Date.now() - askedAt.current < ASK_AGAIN_MS) return;
        askedAt.current = Date.now();

        const reset = async () => {
          const token = await getAccessToken();
          const r = token ? await accountKeyCall("reset", token) : null;
          Alert.alert(
            r?.at ? "Reset started" : "That didn't go through",
            r?.at
              ? `This phone gets in on ${day(r.at)}, unless one of your devices stops it.`
              : "Try again in a moment.",
          );
        };

        Alert.alert(
          `Approve this ${deviceName()}`,
          "Gryt uses one encryption key for all your devices. Your other devices may already show a prompt. If not, open Gryt on one of them, go to Settings, Your devices, Link a device, and type the code this phone shows.\n\nServers and calls work while you wait. Only your DMs wait for this." +
            (resetAt ? `\n\nThis phone gets in on ${day(resetAt)}, unless one of your devices stops it.` : ""),
          [
            { text: "Show the code", onPress: () => router.push(youPage("/link-from-device")) },
            { text: "No other device? Use your 24 words", onPress: () => router.push(youPage("/identity")) },
            resetAt
              ? { text: "Not now", style: "cancel" }
              : { text: "I've lost every device", style: "destructive", onPress: () => void reset() },
          ],
          { cancelable: true },
        );
      }),
    [getAccessToken],
  );

  useEffect(() => {
    if (!sub) return;
    void (async () => {
      const token = await getAccessToken();
      const s = token ? await accountKeyCall("status", token) : null;
      // One key per account: the first device of a several-key account to get here keeps its key.
      if (token && s?.known && s.multi && (await accountKeyCall("claim", token))?.result === "kept") showKeptKey();
      if (s && !s.known) await keyDropped();
      if (!s?.known || !s.resetAt || s.resetIsYours) return;

      const stop = async () => {
        const t = await getAccessToken();
        const r = t ? await accountKeyCall("reset/cancel", t) : null;
        Alert.alert(
          r?.ok ? "Stopped" : "That didn't go through",
          r?.ok ? "Change your password if that wasn't you." : "Try again in a moment.",
        );
      };

      Alert.alert(
        "Someone is trying to sign in as you",
        `A device without your key said it lost every other device. It gets into your account on ${day(s.resetAt)} unless you stop it. If that wasn't you, stop it and change your password.`,
        [
          { text: "It was me", style: "cancel" },
          { text: "It wasn't me, stop it", style: "destructive", onPress: () => void stop() },
        ],
      );
    })();
  }, [sub, getAccessToken]);

  return null;
}

/** Once, on the device that kept the account key. Only several-key accounts ever see it. */
function showKeptKey(): void {
  Alert.alert(
    "This device now holds your account key",
    "Gryt now uses one encryption key for all your devices. The next time you use one of your other devices, approve it from this one.",
    [
      { text: "OK", style: "cancel" },
      { text: "Approve a device", onPress: () => router.push(youPage("/link-device")) },
    ],
  );
}
