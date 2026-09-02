import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Switch, Text, TextField, useTheme, useToast } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";

import { useBlocks } from "../connection/BlocksProvider";
import { useServerConnection } from "../connection/ConnectionsProvider";
import { useMembers } from "../connection/MembersProvider";
import { useTabBarSpace } from "../shell/TabBar";
import { buildReportRequest, canSendReport, REPORT_REASON_MAX } from "./reportUser";

/**
 * Reporting a person, rather than one thing they said.
 *
 * A screen rather than a sheet, for the reason `BanScreen` is one: a reason is
 * typed, and an action sheet with a text field in it fights the keyboard on
 * both platforms.
 *
 * Unlike a ban this is not a moderator act. It asks for `report_messages`,
 * which every member holds by default, and it has no rank check anywhere — the
 * report about the person who runs the server is the one that must go through.
 *
 * **Blocking is offered here and defaults to on.** The report reaches whoever
 * is awake to read it, which at three in the morning is nobody; the block takes
 * effect on the way out. It is reversible from the same long press.
 */
export function ReportUserScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  const toast = useToast();
  const { socket, getAccessToken } = useServerConnection();
  const { all } = useMembers();
  const { isBlocked, block } = useBlocks();

  const { id } = useLocalSearchParams<{ id: string }>();
  const member = all.find((m) => m.serverUserId === id);
  const name = member?.nickname ?? "them";
  const alreadyBlocked = isBlocked(id);

  const [reason, setReason] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(!alreadyBlocked);
  const [sending, setSending] = useState(false);

  /**
   * The answer, or the absence of one.
   *
   * A server too old to know `user:report` does not register the event and
   * therefore sends nothing back. Without this the screen would pop, the toast
   * would never come, and the report would read as sent. The desktop client
   * waits the same six seconds for the same reason.
   */
  useEffect(() => {
    if (!socket || !sending) return;
    let live = true;

    const done = (message: string, severity?: "error") => {
      if (!live) return;
      live = false;
      toast.show({ description: message, ...(severity ? { severity } : {}) });
      router.back();
    };

    const onSubmitted = () => done("Report sent to the moderators.");
    const onAlready = () => done("You already have an open report about them.");

    socket.on("report:user_submitted", onSubmitted);
    socket.on("report:user_already_reported", onAlready);

    const timer = setTimeout(
      () => done("This server is too old to take reports about a person.", "error"),
      6_000,
    );

    return () => {
      live = false;
      clearTimeout(timer);
      socket.off("report:user_submitted", onSubmitted);
      socket.off("report:user_already_reported", onAlready);
    };
  }, [socket, sending, toast]);

  const send = useCallback(async () => {
    if (!socket || !id) return;
    const accessToken = await getAccessToken();
    if (!accessToken) {
      toast.show({
        description: "Not signed in to this server. Try reconnecting.",
        severity: "error",
      });
      return;
    }

    /* The block does not wait on the report landing. It is the reporter's own
       act, it needs no moderator, and on a server too old for `user:report` it
       is the half that still works. */
    if (alsoBlock && !alreadyBlocked) block(id);

    setSending(true);
    socket.emit("user:report", { accessToken, ...buildReportRequest({ serverUserId: id, reason }) });
  }, [socket, id, getAccessToken, reason, alsoBlock, alreadyBlocked, block, toast]);

  const ready = canSendReport(reason);

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
            width: 40, height: 40, borderRadius: theme.radius.full,
            alignItems: "center", justifyContent: "center",
            backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
          })}
        >
          <CaretLeftIcon size={20} color={theme.color.text} weight="bold" />
        </Pressable>
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700", flex: 1 }}>
          Report {name}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.space(4),
          paddingBottom: bottom + theme.space(8),
          gap: theme.space(5),
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 20 }}>
          This goes to the moderators of this server, who can see that it came from
          you. {name} is told nothing.
        </Text>

        <TextField
          label="What happened?"
          helperText={`${reason.trim().length}/${REPORT_REASON_MAX}`}
          value={reason}
          onChangeText={setReason}
          placeholder="Following me between channels and repeating it after I asked them to stop"
          maxLength={REPORT_REASON_MAX}
          multiline
          minRows={3}
          editable={!sending}
        />

        {!alreadyBlocked ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: theme.space(3),
            }}
          >
            <Text style={{ color: theme.color.text, fontSize: 15, flex: 1 }}>
              Block them as well, so they cannot reach you while this is looked at
            </Text>
            <Switch checked={alsoBlock} onCheckedChange={setAlsoBlock} disabled={sending} />
          </View>
        ) : null}

        <Button tone="danger" disabled={!ready || sending} onPress={() => void send()}>
          {sending ? "Sending…" : `Report ${name}`}
        </Button>
      </ScrollView>
    </View>
  );
}
