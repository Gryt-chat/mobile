import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Text, useTheme } from "@gryt/ui-native";

import { useGrytAccount } from "./AccountProvider";

/**
 * Where `gryt://auth/callback` lands when the auth session did not catch it — Android
 * replaced the process while the browser was in front of it. **It does not just
 * redirect**: the code is still good and `completeSignIn` has what it needs.
 */
export function AuthCallbackScreen() {
  const theme = useTheme();
  const { completeSignIn } = useGrytAccount();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [message, setMessage] = useState<string | null>(null);

  /* Once. `useLocalSearchParams` returns a fresh object each render, and an exchange is
     single use — a second attempt fails for a reason that is not the real one. */
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
      /* Back to the account screen either way, and by replace, so the callback is not
         somewhere the back gesture can return to. */
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
