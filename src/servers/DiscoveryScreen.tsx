import { Pressable, ScrollView, View, Linking } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Spinner, Surface, Text, useTheme } from "@gryt/ui-native";
import { BroadcastIcon } from "phosphor-react-native/src/icons/Broadcast";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";

import { ServerIcon } from "./ServerIcon";
import { useShell } from "../shell/ShellContext";

/**
 * The Gryt servers advertising themselves on this network.
 *
 * **A page, not a section inside the join sheet.** It was a section, and it was
 * the wrong shape twice over. The sheet is where you *join* a server — a field,
 * a lookup, a card, a button — and a list that grows with the network pushed
 * that button off the bottom; with the keyboard up it was unreachable at three
 * servers. And browsing what is on a network is a different errand from
 * joining a particular one, which is what a separate destination is for.
 *
 * So Discovery browses, and the sheet joins. Tapping a row here hands the
 * address to the sheet rather than joining, because mDNS knows a name and a
 * port and nothing about who may join or whether an account is needed — the
 * `/info` lookup and the card still have to happen, and they happen in one
 * place.
 */
export function DiscoveryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { lan, setInvite, setAddServerOpen, setServer } = useShell();

  const join = (address: string) => {
    /* Back first, so the sheet is not opened over a screen that is about to
     * pop out from under it. */
    router.back();
    setInvite(address);
    setAddServerOpen(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <View
        style={{
          paddingTop: insets.top + theme.space(1),
          paddingBottom: theme.space(2),
          paddingHorizontal: theme.space(2),
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(2),
          borderBottomWidth: 1,
          borderColor: theme.color.border,
          backgroundColor: theme.color.surface,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: theme.radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
          })}
        >
          <CaretLeftIcon size={20} color={theme.color.text} weight="bold" />
        </Pressable>
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700" }}>
          On your network
        </Text>
        {lan.searching ? <Spinner size="small" color={theme.color.muted} /> : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.space(4), gap: theme.space(2) }}>
        {!lan.available ? (
          <Empty
            title="Not available on this device"
            body="Finding servers on a network needs a build with the discovery module in it. You can still add a server by address."
          />
        ) : lan.blocked ? (
          <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="button">
            <Surface bordered radius="lg" padding={theme.space(4)} style={{ gap: 6 }}>
              <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "600" }}>
                Gryt cannot see your network
              </Text>
              <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 19 }}>
                Local network access is off, so nothing here can be found. Turn it on in
                Settings — you can still add a server by address.
              </Text>
            </Surface>
          </Pressable>
        ) : lan.servers.length === 0 ? (
          <Empty
            title={lan.searching ? "Looking…" : "Nothing found"}
            body={
              lan.searching
                ? "Listening for servers advertising themselves here."
                : "Nothing is advertising itself on this network. A server only shows up here if it is discoverable."
            }
          />
        ) : (
          lan.servers.map((server) => (
            <Pressable
              key={server.address}
              disabled={server.joined}
              /* Same as the add sheet: joining a server is how you get to it,
                 so land on it rather than on whatever was open before. */
              onPress={() => {
                void Promise.resolve(join(server.address)).then(() => {
                  setServer(server.address);
                  router.navigate("/(tabs)/(server)");
                });
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled: server.joined }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: theme.space(3),
                padding: theme.space(2),
                borderRadius: theme.radius.lg,
                backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
                opacity: server.joined ? 0.5 : 1,
              })}
            >
              <ServerIcon host={server.address} name={server.name} size={44} />

              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.color.text, fontSize: 17, fontWeight: "600" }}>
                  {server.name}
                </Text>
                <Text style={{ color: theme.color.muted, fontSize: 14 }} numberOfLines={1}>
                  {server.joined ? `${server.address} · already added` : server.address}
                </Text>
              </View>

              {server.joined ? null : (
                <CaretRightIcon size={16} color={theme.color.muted} weight="bold" />
              )}
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Nothing to show, and why.
 *
 * A page can afford to say the reason where a section inside a sheet could
 * only afford a line — which is part of what makes this the right shape.
 */
function Empty({ title, body }: { title: string; body: string }) {
  const theme = useTheme();

  return (
    <View style={{ alignItems: "center", gap: theme.space(3), paddingTop: theme.space(8) }}>
      <BroadcastIcon size={36} color={theme.color.muted} weight="fill" />
      <Text style={{ color: theme.color.text, fontSize: 17, fontWeight: "600" }}>{title}</Text>
      <Text
        style={{
          color: theme.color.muted,
          fontSize: 14,
          lineHeight: 20,
          textAlign: "center",
        }}
      >
        {body}
      </Text>
    </View>
  );
}
