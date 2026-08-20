import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { normalizeCode, normalizeHost } from "../src/servers/address";
import { useShell } from "../src/shell/ShellContext";

/**
 * Where an invite link lands.
 *
 * `gryt://invite?host=…&code=…` — the scheme the OS routes to this app — and
 * `https://gryt.chat/invite?host=…&code=…` once universal links are set up.
 * The site's own invite page offers to open this, which is the whole point: an
 * invite arrives in a message and gets tapped, and nobody is going to read an
 * address off one screen and type it into another.
 *
 * This route holds nothing. It hands the invite to the shell, which opens the
 * join sheet over whatever is underneath, and then gets out of the way — an
 * invite is a thing that happens to the app, not a place in it. Leaving it on
 * the stack would put a blank screen behind the sheet and a back gesture that
 * returns to it.
 *
 * A link with no host is treated as no invite at all rather than as an error,
 * because the OS hands the app its own launch URL on a cold start and that has
 * no host in it.
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
