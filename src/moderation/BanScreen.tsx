import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Switch, Text, TextField, useTheme, useToast } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";

import { useServerConnection } from "../connection/ConnectionsProvider";
import { useMembers } from "../connection/MembersProvider";
import { useTabBarSpace } from "../shell/TabBar";
import {
  BAN_DURATIONS,
  buildBanRequest,
  canRevokeInvite,
  DEFAULT_DURATION,
  describeInvite,
  REASON_MAX,
  type MemberInvite,
} from "./banOptions";

/**
 * The four things a ban is, besides who.
 *
 * The phone could only send the desktop's defaults — permanent, delete their
 * messages, keep the invite — because these needed a form. GRYT-836.
 *
 * **A screen rather than a sheet.** A reason is typed, so a keyboard comes up,
 * and an action sheet with a text field in it fights the keyboard on both
 * platforms. It is also the one moderator action here worth slowing down.
 */
export function BanScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  const toast = useToast();
  const { socket, getAccessToken } = useServerConnection();
  const { all } = useMembers();

  const { id } = useLocalSearchParams<{ id: string }>();
  const member = all.find((m) => m.serverUserId === id);
  const name = member?.nickname ?? "them";

  const [reason, setReason] = useState("");
  const [durationId, setDurationId] = useState(DEFAULT_DURATION);
  const [deleteContent, setDeleteContent] = useState(true);
  const [revokeInvite, setRevokeInvite] = useState(false);
  const [invite, setInvite] = useState<MemberInvite | null>(null);
  const [banning, setBanning] = useState(false);

  /**
   * How they got in.
   *
   * Gated on `create_invite` server-side rather than on `ban_members`, so a
   * moderator who may ban and not invite gets nothing back. That is why this
   * fails to null instead of erroring: the row simply does not appear, and
   * the ban still works.
   */
  useEffect(() => {
    if (!socket || !id) return;
    let live = true;

    const onInvite = (info: MemberInvite) => {
      if (!live || info?.targetServerUserId !== id) return;
      setInvite(info);
    };
    socket.on("server:member:invite", onInvite);

    void (async () => {
      const accessToken = await getAccessToken();
      if (!accessToken || !live) return;
      socket.emit("server:member:invite", { accessToken, targetServerUserId: id });
    })();

    return () => {
      live = false;
      socket.off("server:member:invite", onInvite);
    };
  }, [socket, id, getAccessToken]);

  const ban = useCallback(async () => {
    if (!socket || !id) return;
    const accessToken = await getAccessToken();
    if (!accessToken) {
      toast.show({ description: "Not signed in to this server. Try reconnecting.", severity: "error" });
      return;
    }
    setBanning(true);
    socket.emit("server:ban", {
      accessToken,
      ...buildBanRequest({
        targetServerUserId: id, reason, durationId, deleteContent, revokeInvite, invite,
      }),
    });
    /* Back on the emit rather than on a reply. The success toast belongs to
       `useModeration`, which is mounted on the drawer this came from, and
       waiting here would leave the moderator on a form for somebody the
       member list has already dropped. */
    router.back();
  }, [socket, id, getAccessToken, reason, durationId, deleteContent, revokeInvite, invite, toast]);

  const showInviteRow = canRevokeInvite(invite);

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
          Ban {name}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: theme.space(4), paddingBottom: bottom + theme.space(8), gap: theme.space(5) }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 20 }}>
          They are removed and cannot come back until the ban lifts. You can lift it
          from Banned people.
        </Text>

        <TextField
          label="Reason"
          helperText="Optional. Shown to them."
          value={reason}
          onChangeText={setReason}
          placeholder="Repeated harassment after a warning"
          maxLength={REASON_MAX}
          multiline
          minRows={2}
          editable={!banning}
        />

        <View style={{ gap: theme.space(2) }}>
          <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "600" }}>How long</Text>
          {/* A list of rows rather than the desktop's dropdown. Five options is
              under the count where a picker earns the extra tap, and every one
              stays readable. */}
          <View style={{ borderRadius: theme.radius.lg, overflow: "hidden", borderWidth: 1, borderColor: theme.color.border }}>
            {BAN_DURATIONS.map((d, i) => (
              <Pressable
                key={d.id}
                onPress={() => setDurationId(d.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: durationId === d.id }}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: theme.space(3),
                  paddingVertical: theme.space(3),
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: theme.color.border,
                  backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surface,
                })}
              >
                <Text style={{ color: theme.color.text, fontSize: 15 }}>{d.label}</Text>
                {durationId === d.id ? (
                  <CheckIcon size={18} color={theme.color.accent} weight="bold" />
                ) : null}
              </Pressable>
            ))}
          </View>
        </View>

        <ToggleRow
          label="Delete their messages and reactions"
          hint={deleteContent ? undefined : "Their messages stay where they are."}
          checked={deleteContent}
          onChange={setDeleteContent}
          disabled={banning}
        />

        {showInviteRow && invite ? (
          <ToggleRow
            label="Revoke the invite they joined with"
            /* The reason this row exists at all: an identity with no account
               behind it costs nothing to replace, so a ban on somebody who
               arrived on a still-open code does not keep them out. */
            hint={`They joined with ${invite.code}, ${describeInvite(invite)}. Others can still use it.`}
            checked={revokeInvite}
            onChange={setRevokeInvite}
            disabled={banning}
          />
        ) : null}

        <Button tone="danger" disabled={banning} onPress={() => void ban()}>
          {banning ? "Banning…" : `Ban ${name}`}
        </Button>
      </ScrollView>
    </View>
  );
}

function ToggleRow({
  label, hint, checked, onChange, disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: theme.space(3) }}>
      <View style={{ flex: 1, gap: theme.space(1) }}>
        <Text style={{ color: theme.color.text, fontSize: 15 }}>{label}</Text>
        {hint ? (
          <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 18 }}>{hint}</Text>
        ) : null}
      </View>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </View>
  );
}
