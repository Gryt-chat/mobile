import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, useTheme, useToast } from "@gryt/ui-native";

import { MAX_ATTACHMENTS } from "../chat/staging";
import { useServerConnection } from "../connection/ConnectionsProvider";
import { useShell } from "../shell/ShellContext";
import { useBackToClose } from "../ui/useBackToClose";
import { summarise } from "./summary";
import { useIncomingShare } from "./useIncomingShare";
import { useRecents } from "./RecentsProvider";

/**
 * Where a shared picture, link or file should go.
 *
 * The list is the channels you last spoke in, newest first. The alternative —
 * pick a server, wait for it to connect, pick a channel — is three steps and a
 * network round trip to answer a question the phone already knows.
 *
 * Below the recents, the channels on whatever server is open. That is the path
 * for the first share ever made from this phone.
 *
 * **Nothing is sent from here.** Tapping a row hands the share to the channel's
 * own composer and goes there — sending from here would mean a second
 * upload-and-send path beside the one every other message uses. See `handoff`
 * in `ShellContext`.
 *
 * A plain `Modal` rather than the library's `Sheet`: `Sheet` portals into
 * `SheetProvider`, which sits outside the switcher's `Drawer`, so it would draw
 * behind it. `actionSheet.tsx` gives that at length.
 */
export function ShareSheet() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { share, setShare, setHandoff, setServer, server, servers } = useShell();
  const { recents } = useRecents();
  const { state } = useServerConnection();

  const toast = useToast();

  /**
   * Listening happens here, in the thing that reacts to it.
   *
   * Mounted for as long as the tabs are, which is as long as there is anywhere
   * for a share to go — the share sheet with nothing to put in it is not a
   * state worth having, and a listener above the connection could not offer
   * this server's channels.
   */
  useIncomingShare((incoming, dropped) => {
    setShare(incoming);
    if (dropped > 0) {
      /* Said out loud rather than swallowed. Quietly sending four of somebody's
       * forty photos is the kind of thing only the person on the other end
       * finds out about. */
      toast.show({
        title: `Only ${MAX_ATTACHMENTS} at a time`,
        description: `${dropped} more ${dropped === 1 ? "file was" : "files were"} left out.`,
        severity: "warning",
      });
    }
  });

  /* Stable, because `useBackToClose` adds and removes a hardware-back listener
   * whenever it changes — a fresh closure every render would mean doing that on
   * every render. */
  const close = useCallback(() => setShare(null), [setShare]);
  useBackToClose(share !== null, close);

  /* Only text channels. A voice channel has no composer to hand anything to. */
  const here = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.channels.filter((channel) => channel.type === "text");
  }, [state]);

  /* Recents already covering a channel on this server should not appear twice.
   * The recents row is the better of the two — it carries the server's name. */
  const inRecents = useMemo(
    () => new Set(recents.filter((r) => r.host === server?.host).map((r) => r.channelId)),
    [recents, server?.host],
  );

  const choose = (host: string, channelId: string) => {
    if (!share) return;
    /* In this order. Switching server first means the channel route mounts
     * against the connection it belongs to rather than against the previous
     * one, which would look up the id on the wrong server and find nothing. */
    if (host !== server?.host) setServer(host);
    setHandoff({ channelId, share });
    setShare(null);
    router.push({ pathname: "/channel/[id]", params: { id: channelId } });
  };

  const Row = ({
    name,
    detail,
    onPress,
  }: {
    name: string;
    detail?: string;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${name}, on ${detail}` : name}
      style={({ pressed }) => ({
        paddingVertical: theme.space(3),
        paddingHorizontal: theme.space(4),
        backgroundColor: pressed ? theme.color.surfaceRaised : "transparent",
      })}
    >
      <Text style={{ fontWeight: "500", color: theme.color.text }}>#{name}</Text>
      {detail ? (
        <Text style={{ fontSize: 13, color: theme.color.muted }}>
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );

  return (
    <Modal
      visible={share !== null}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel sharing"
          onPress={close}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        />

        <View
          style={{
            backgroundColor: theme.color.surface,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            paddingTop: theme.space(4),
            paddingBottom: insets.bottom + theme.space(2),
            maxHeight: "80%",
          }}
        >
          <View style={{ paddingHorizontal: theme.space(4), paddingBottom: theme.space(3) }}>
            <Text style={{ fontWeight: "600", fontSize: 17, color: theme.color.text }}>
              Share to
            </Text>
            {share ? (
              <Text
                numberOfLines={2}
                style={{ fontSize: 13, color: theme.color.muted }}
              >
                {summarise(share)}
              </Text>
            ) : null}
          </View>

          <ScrollView>
            {recents.length > 0 ? (
              <>
                <Heading>Recent</Heading>
                {recents.map((recent) => (
                  <Row
                    key={`${recent.host}:${recent.channelId}`}
                    name={recent.channelName || recent.channelId}
                    detail={
                      recent.serverName ||
                      servers.find((s) => s.host === recent.host)?.name ||
                      recent.host
                    }
                    onPress={() => choose(recent.host, recent.channelId)}
                  />
                ))}
              </>
            ) : null}

            {server && here.some((channel) => !inRecents.has(channel.id)) ? (
              <>
                <Heading>{server.name}</Heading>
                {here
                  .filter((channel) => !inRecents.has(channel.id))
                  .map((channel) => (
                    <Row
                      key={channel.id}
                      name={channel.name}
                      onPress={() => choose(server.host, channel.id)}
                    />
                  ))}
              </>
            ) : null}

            {/* The only case with nothing to offer: a first launch that has
                joined a server and not yet connected to it. Saying so beats an
                empty sheet, which reads as broken. */}
            {recents.length === 0 && here.length === 0 ? (
              <View style={{ padding: theme.space(4) }}>
                <Text style={{ color: theme.color.muted }}>
                  {servers.length === 0
                    ? "Join a server first, and its channels will show up here."
                    : "Waiting for the channel list. Try again in a moment."}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Heading({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text
      style={{
        fontWeight: "600",
        fontSize: 12,
        color: theme.color.muted,
        textTransform: "uppercase",
        paddingHorizontal: theme.space(4),
        paddingTop: theme.space(3),
        paddingBottom: theme.space(1),
      }}
    >
      {children}
    </Text>
  );
}
