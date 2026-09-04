import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Spinner, Surface, Text, useTheme, useToast } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";

import { useServerConnection } from "../connection/ConnectionsProvider";
import { canOnServer } from "../connection/permissions";
import { useTabBarSpace } from "../shell/TabBar";
import { useConfirm } from "../ui/actionSheet";
import { toRows, type BanRecord, type BanRow } from "./bans";

/**
 * Who is banned here, and the way back.
 *
 * The phone could ban somebody before it could show this, which made the ban
 * confirmation say that lifting one needed the desktop (GRYT-837).
 *
 * **Viewing and lifting are two different permissions**, and the server means
 * it: `server:bans:list` is gated on `view_bans` and `server:unban` on
 * `ban_members`. So the Unban button is absent for somebody who may only see
 * the list, rather than present and refused.
 *
 * A screen rather than something hung off a member row, because everybody on
 * this list has stopped being a member — there is no row to long-press.
 */
export function BanListScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  const toast = useToast();
  const confirm = useConfirm();
  const { socket, online, state, getAccessToken } = useServerConnection();

  const [rows, setRows] = useState<BanRow[] | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const info = state.status === "ready" ? state.details : undefined;
  const mayLift = canOnServer(info, "ban_members");

  const refresh = useCallback(async () => {
    if (!socket) return;
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    socket.emit("server:bans:list", { accessToken });
  }, [socket, getAccessToken]);

  useEffect(() => {
    if (!socket) return;

    const onBans = (payload: { bans?: BanRecord[] }) => {
      setRows(toRows(Array.isArray(payload?.bans) ? payload.bans : []));
      setWorking(null);
    };

    /* The unban answers with the id it acted on rather than a fresh list, so
       the list is asked for again — the same trade the blocks list makes. */
    const onUnbanned = () => { void refresh(); };

    const onError = (payload: { error?: string; message?: string }) => {
      setWorking(null);
      /* `forbidden` here means this account may not read the list at all, and
         the empty state below already says so in words. Anything else is worth
         showing. */
      if (payload?.error === "forbidden") { setRows([]); return; }
      if (payload?.message) toast.show({ description: payload.message, severity: "error" });
    };

    socket.on("server:bans", onBans);
    socket.on("server:unban:success", onUnbanned);
    socket.on("server:error", onError);
    return () => {
      socket.off("server:bans", onBans);
      socket.off("server:unban:success", onUnbanned);
      socket.off("server:error", onError);
    };
  }, [socket, refresh, toast]);

  useEffect(() => {
    if (!online) return;
    void refresh();
  }, [online, refresh]);

  const lift = async (row: BanRow) => {
    const sure = await confirm({
      title: `Unban ${row.title}?`,
      message: "They can join again with an invite. What was deleted when they were banned does not come back.",
      confirm: "Unban",
    });
    if (!sure) return;

    const accessToken = await getAccessToken();
    if (!accessToken || !socket) {
      toast.show({ description: "Not signed in to this server. Try reconnecting.", severity: "error" });
      return;
    }
    setWorking(row.grytUserId);
    socket.emit("server:unban", { accessToken, grytUserId: row.grytUserId });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <View
        style={{
          paddingTop: insets.top + theme.space(1),
          paddingBottom: theme.space(3),
          paddingHorizontal: theme.space(3),
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(2),
          backgroundColor: theme.color.surface,
          borderBottomWidth: 1,
          borderColor: theme.color.border,
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
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700", flex: 1 }}>
          Banned people
        </Text>
      </View>

      {rows === null ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Spinner />
        </View>
      ) : rows.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space(6) }}>
          <Text style={{ color: theme.color.muted, textAlign: "center" }}>
            Nobody is banned here.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: theme.space(3), paddingBottom: bottom + theme.space(6), gap: theme.space(2) }}>
          {rows.map((row) => (
            <Surface key={row.grytUserId} style={{ padding: theme.space(3), gap: theme.space(1) }}>
              <Text
                style={{
                  color: row.named ? theme.color.text : theme.color.muted,
                  fontSize: 16,
                  // A shortened subject is an id rather than a name, so it is
                  // drawn dimmer and lighter instead of like somebody's name.
                  fontWeight: row.named ? "600" : "500",
                }}
              >
                {row.title}
              </Text>
              {row.reason ? (
                <Text style={{ color: theme.color.text, fontSize: 14 }}>{row.reason}</Text>
              ) : (
                <Text style={{ color: theme.color.muted, fontSize: 14, fontStyle: "italic" }}>
                  No reason given
                </Text>
              )}
              <Text style={{ color: theme.color.muted, fontSize: 12.5 }}>
                {row.attribution} · {row.duration}
              </Text>
              {mayLift ? (
                <View style={{ flexDirection: "row", marginTop: theme.space(1) }}>
                  <Button
                    tone="ghost"
                    disabled={working === row.grytUserId}
                    onPress={() => void lift(row)}
                  >
                    {working === row.grytUserId ? "Unbanning…" : "Unban"}
                  </Button>
                </View>
              ) : null}
            </Surface>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
