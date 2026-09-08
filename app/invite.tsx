import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { normalizeCode, normalizeHost } from "../src/servers/address";
import { useShell } from "../src/shell/ShellContext";

/**
 * Where an invite link lands — `gryt://invite?host=…&code=…`. It hands the invite to the
 * shell and leaves, or a blank screen sits behind the sheet. No host is no invite.
 */
export default function Invite() {
  const theme = useTheme();
  const { host, code } = useLocalSearchParams<{ host?: string; code?: string }>();
  const { setInvite, setAddServerOpen } = useShell();

  const cleanHost = normalizeHost(host ?? "");
  const cleanCode = normalizeCode(code ?? "");

  useEffect(() => {
    if (!cleanHost) return;
    // Handed on as a link rather than as a host, so the sheet's field parses it
    // with `parseServerInput` exactly as it would a paste.
    setInvite(
      cleanCode
        ? `gryt://invite?host=${encodeURIComponent(cleanHost)}&code=${encodeURIComponent(cleanCode)}`
        : cleanHost,
    );
    setAddServerOpen(true);
  }, [cleanHost, cleanCode, setInvite, setAddServerOpen]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <Redirect href="/" />
    </View>
  );
}
