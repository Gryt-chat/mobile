import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Text, useTheme } from "@gryt/ui-native";

import { useGrytAccount } from "./AccountProvider";

/**
 * Where `gryt://auth/callback` lands when the auth session did not catch it.
 *
 * Normally nothing reaches here: `promptAsync` hands the redirect straight back
 * and the flow finishes inside `useAccount`. This is the other case — Android
 * replaced the process while the browser was in front of it, so the redirect
 * arrives as a cold deep link and the router owns it.
 *
 * Before this route existed that was expo-router's "Unmatched Route" screen,
 * which is what a tester saw on 2026-09-02 and reads as the app being broken
 * rather than as a sign-in that needs another go. The root layout already
 * learned this once, for `gryt://invite`: the router owns the URL, so a URL the
 * app handles has to be a route.
 *
 * It does not just redirect. The code in the URL is still good, and
 * `completeSignIn` has what it needs written down, so the sign-in finishes here
 * rather than sending somebody back to press the button again.
 */
export function AuthCallbackScreen() {
  const theme = useTheme();
  const { completeSignIn } = useGrytAccount();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [message, setMessage] = useState<string | null>(null);

  /* Once. `useLocalSearchParams` returns a fresh object each render, and an
     exchange is single use — a second attempt spends a code that has already
     been redeemed and fails for a reason that is not the real one. */
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      if (params.error) {
        setMessage("Sign-in was cancelled.");
      } else {
        await completeSignIn({ code: params.code, state: params.state });
      }
      /* Back to the account screen either way, and by replace so the callback
         is not somewhere the back gesture can return to — the code is spent and
         a second visit can only fail. */
      router.replace("/you");
    })();
  }, [completeSignIn, params.code, params.error, params.state]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: theme.space(3),
        backgroundColor: theme.color.bg,
      }}
    >
      <ActivityIndicator color={theme.color.accent} />
      <Text style={{ color: theme.color.muted, fontSize: 15 }}>
        {message ?? "Finishing sign-in…"}
      </Text>
    </View>
  );
}
