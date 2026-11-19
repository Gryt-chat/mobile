import { Pressable, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Button, Surface, Text, useTheme, useToast } from "@gryt/ui-native";
import { ArrowSquareOutIcon } from "phosphor-react-native/src/icons/ArrowSquareOut";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
import { CloudIcon } from "phosphor-react-native/src/icons/Cloud";
import { HashIcon } from "phosphor-react-native/src/icons/Hash";
import { UsersThreeIcon } from "phosphor-react-native/src/icons/UsersThree";

import { CLOUD_CONSOLE_URL } from "../server/planMode";
import { useServerJoinPolicy } from "../servers/joinPolicy";
import { copyInviteLink } from "../servers/useServerMenu";
import { CheerOwl } from "../ui/CheerOwl";

/** 3.5: the owner's first open of a brand-new Gryt Cloud server, in place of the empty channel. */
export function CloudWelcome({ host, serverName }: { host: string; serverName: string }) {
  const theme = useTheme();
  const toast = useToast();
  const open = useServerJoinPolicy(host) === "open";
  const rows = [
    { icon: <UsersThreeIcon size={18} color={theme.color.accent} weight="fill" />, title: "Invite your friends", go: () => router.push("/server-settings/invites" as never), end: open ? <Button onPress={() => copyInviteLink(host, toast)}>Copy invite</Button> : <CaretRightIcon size={14} color={theme.color.muted} /> },
    { icon: <HashIcon size={18} color={theme.color.accent} weight="bold" />, title: "Server settings", sub: "Channels, roles, members", go: () => router.push("/server-settings"), end: <CaretRightIcon size={14} color={theme.color.muted} /> },
    { icon: <CloudIcon size={18} color={theme.color.accent} weight="fill" />, title: "Manage in Gryt Cloud", go: () => void WebBrowser.openBrowserAsync(`${CLOUD_CONSOLE_URL}/servers/${encodeURIComponent(host)}`), end: <ArrowSquareOutIcon size={14} color={theme.color.muted} /> },
  ];
  return (
    <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: theme.space(5), gap: theme.space(4) }}>
      <View style={{ alignSelf: "center" }}>
        <CheerOwl size={120} />
      </View>
      <View style={{ alignItems: "center", gap: 6 }}>
        <Text style={{ color: theme.color.text, fontSize: 22, fontWeight: "700", textAlign: "center" }}>Welcome to your brand new server! 🎉</Text>
        <Text style={{ color: theme.color.muted, fontSize: 14, textAlign: "center" }}>{serverName} is yours. Here’s where to start.</Text>
      </View>
      <Surface bordered radius="lg" padding={0}>
        {rows.map((r, i) => (
          <Pressable
            key={r.title}
            onPress={r.go}
            accessibilityRole="button"
            style={{ minHeight: 60, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: theme.space(4), paddingVertical: theme.space(3), borderTopWidth: i ? 1 : 0, borderColor: theme.color.surfaceHover }}
          >
            <View style={{ width: 36, height: 36, borderRadius: theme.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: theme.alpha.accent[2] }}>{r.icon}</View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "600" }}>{r.title}</Text>
              {r.sub ? <Text style={{ color: theme.color.muted, fontSize: 13 }}>{r.sub}</Text> : null}
            </View>
            {r.end}
          </Pressable>
        ))}
      </Surface>
    </View>
  );
}
