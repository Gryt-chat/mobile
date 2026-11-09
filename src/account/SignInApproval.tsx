import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Alert } from "react-native";

import { youPage } from "../shell/twoPane";
import { useGrytAccount } from "./AccountProvider";
import { accountKeyCall, onApprovalRequired } from "./store";

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
          "Approve this sign-in",
          "Your password is right, but your account only lets in devices you've approved. Link this phone from a device that's already signed in, or use your 24 words." +
            (resetAt ? `\n\nThis phone gets in on ${day(resetAt)}, unless one of your devices stops it.` : ""),
          [
            { text: "Link this device", onPress: () => router.push(youPage("/link-from-device")) },
            { text: "Use my 24 words", onPress: () => router.push(youPage("/identity")) },
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
