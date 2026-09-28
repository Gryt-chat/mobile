import { useCallback, useEffect, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Select, Spinner, Surface, Switch, Text, TextField, useTheme, useToast } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CopyIcon } from "phosphor-react-native/src/icons/Copy";

import { useServerConnection } from "../../connection/ConnectionsProvider";
import { useTabBarSpace } from "../../shell/TabBar";
import { useShell } from "../../shell/ShellContext";
import { useConfirm } from "../../ui/actionSheet";
import { inviteLink } from "../address";
import { useServerJoinPolicy } from "../joinPolicy";
import {
  createInvitePayload,
  DEFAULT_DRAFT_INVITE,
  grantableRoles,
  inviteSummary,
  isInviteItem,
  type DraftInvite,
  type InviteItem,
} from "./invites";

/** Stands in for "no role" so the row is not mistaken for the placeholder. */
const NO_ROLE = "__none__";

interface RoleOption {
  id: string;
  name: string;
  grantableByInvite?: boolean;
}

/**
 * Invites: list, make one with an expiry, a use cap and a bound role, and revoke.
 * `create_invite` alone can make one; seeing and revoking every invite needs `manage_invites`.
 */
export function ServerInvitesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const confirm = useConfirm();
  const tabBarSpace = useTabBarSpace();
  const { socket, getAccessToken, online } = useServerConnection();
  const { server } = useShell();
  const isOpen = useServerJoinPolicy(server?.host) === "open";

  const [invites, setInvites] = useState<InviteItem[] | null>(null);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [draft, setDraft] = useState<DraftInvite>(DEFAULT_DRAFT_INVITE);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!socket || !online) return;
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    socket.emit("server:invites:list", { accessToken });
    socket.emit("server:roles:definitions:list", { accessToken });
  }, [getAccessToken, online, socket]);

  useEffect(() => {
    if (!socket) return;

    const onInvites = (payload: { invites?: unknown[] }) => {
      const list = Array.isArray(payload?.invites) ? payload.invites.filter(isInviteItem) : [];
      setInvites(list);
    };

    const onCreated = (payload: { invite?: unknown }) => {
      if (!isInviteItem(payload?.invite)) return;
      const invite = payload.invite;
      setInvites((prev) => [invite, ...(prev ?? []).filter((p) => p.code !== invite.code)]);
      toast.show({ title: "Invite created", severity: "success" });
      setCreating(false);
    };

    const onRevoked = (payload: { code?: string; revoked?: boolean }) => {
      if (typeof payload?.code !== "string" || typeof payload?.revoked !== "boolean") return;
      setInvites((prev) => prev?.map((i) => (i.code === payload.code ? { ...i, revoked: payload.revoked! } : i)) ?? prev);
      setRevoking(null);
    };

    const onRoles = (payload: { roles?: RoleOption[] }) => {
      if (payload?.roles) setRoles(payload.roles);
    };

    const onError = (payload: { message?: string }) => {
      setCreating(false);
      setRevoking(null);
      if (payload?.message) toast.show({ description: payload.message, severity: "error" });
    };

    socket.on("server:invites", onInvites);
    socket.on("server:invite:created", onCreated);
    socket.on("server:invite:revoked", onRevoked);
    socket.on("server:roles:definitions", onRoles);
    socket.on("server:error", onError);
    return () => {
      socket.off("server:invites", onInvites);
      socket.off("server:invite:created", onCreated);
      socket.off("server:invite:revoked", onRevoked);
      socket.off("server:roles:definitions", onRoles);
      socket.off("server:error", onError);
    };
  }, [socket, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = async () => {
    if (!socket || !online) {
      toast.show({ description: "Not connected to the server yet.", severity: "error" });
      return;
    }
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    setCreating(true);
    socket.emit("server:invites:create", { accessToken, ...createInvitePayload(draft) });
  };

  const copy = async (code: string) => {
    if (!server?.host) return;
    await Clipboard.setStringAsync(inviteLink(server.host, code));
    toast.show({ title: "Copied invite link", severity: "success" });
  };

  const revoke = async (item: InviteItem) => {
    const sure = await confirm({
      title: `Revoke ${item.code}?`,
      message: "Nobody can join on this code again. Anyone already in stays in.",
      confirm: "Revoke",
    });
    if (!sure) return;
    if (!socket || !online) return;
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    setRevoking(item.code);
    socket.emit("server:invites:revoke", { accessToken, code: item.code });
  };

  const eligibleRoles = grantableRoles(roles);

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
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700", flex: 1 }}>Invites</Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.space(4),
          paddingBottom: theme.space(4) + tabBarSpace,
          gap: theme.space(4),
        }}
      >
        <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 19 }}>
          {isOpen
            ? "Anyone can join this server without a code. Make an invite when you want to limit uses or time, or give people a role."
            : "This server is invite-only. Create invite codes to share with people you want to join."}
        </Text>

        <Surface level="surface" bordered radius="lg" style={{ padding: theme.space(3), gap: theme.space(3) }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "600" }}>Infinite uses</Text>
            <Switch
              checked={draft.infiniteUses}
              onCheckedChange={(v) => setDraft({ ...draft, infiniteUses: v })}
            />
          </View>

          {!draft.infiniteUses && (
            <TextField
              label="Max uses"
              value={draft.maxUses}
              onChangeText={(v) => setDraft({ ...draft, maxUses: v })}
              placeholder="1"
              keyboardType="number-pad"
            />
          )}

          <TextField
            label="Expires (hours)"
            value={draft.expiresInHours}
            onChangeText={(v) => setDraft({ ...draft, expiresInHours: v })}
            placeholder="e.g. 24"
            keyboardType="numeric"
          />

          <TextField
            label="Custom code"
            value={draft.customCode}
            onChangeText={(v) => setDraft({ ...draft, customCode: v.replace(/[^a-zA-Z0-9_-]/g, "") })}
            placeholder="Leave blank for random"
            autoCapitalize="none"
          />

          <TextField
            label="Note"
            value={draft.note}
            onChangeText={(v) => setDraft({ ...draft, note: v })}
            placeholder="Optional"
          />

          {eligibleRoles.length === 0 ? (
            <View style={{ gap: 4 }}>
              <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "600" }}>Gives the role</Text>
              <Text style={{ color: theme.color.muted, fontSize: 12, lineHeight: 17 }}>
                No role can be handed out by an invite yet. Turn on "Can be given out by an
                invite" for a role in Roles and it will show up here.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 4 }}>
              <Select
                label="Gives the role"
                value={draft.grantsRole || NO_ROLE}
                onValueChange={(v) => setDraft({ ...draft, grantsRole: v === NO_ROLE ? "" : String(v) })}
                options={[
                  { label: "No role, they join as normal", value: NO_ROLE },
                  ...eligibleRoles.map((r) => ({ label: r.name, value: r.id })),
                ]}
              />
              <Text style={{ color: theme.color.muted, fontSize: 12, lineHeight: 17 }}>
                Anybody joining on this link arrives holding that role, so the link is worth
                as much as the role is.
              </Text>
            </View>
          )}

          <Button tone="primary" disabled={creating} onPress={() => void create()}>
            {creating ? "Creating…" : "Create invite"}
          </Button>
        </Surface>

        <View style={{ gap: theme.space(2) }}>
          <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "600" }}>
            Active &amp; past invites
          </Text>

          {invites === null ? (
            <View style={{ alignItems: "center", paddingVertical: theme.space(6) }}>
              <Spinner />
            </View>
          ) : invites.length === 0 ? (
            <Text style={{ color: theme.color.muted, fontSize: 14 }}>No invites yet.</Text>
          ) : (
            invites.map((item) => (
              <Surface
                key={item.code}
                level="surface"
                bordered
                radius="lg"
                style={{ padding: theme.space(3), gap: theme.space(1) }}
              >
                <Text style={{ color: theme.color.text, fontSize: 15, fontWeight: "700" }}>{item.code}</Text>
                <Text style={{ color: theme.color.muted, fontSize: 12 }}>{inviteSummary(item)}</Text>
                {item.note ? <Text style={{ color: theme.color.muted, fontSize: 12 }}>{item.note}</Text> : null}
                <View style={{ flexDirection: "row", gap: theme.space(2), marginTop: theme.space(1) }}>
                  <Button size="small" tone="ghost" onPress={() => void copy(item.code)}>
                    <CopyIcon size={14} color={theme.color.text} />
                    Copy
                  </Button>
                  <Button
                    size="small"
                    tone="ghost"
                    disabled={!!item.revoked || revoking === item.code}
                    onPress={() => void revoke(item)}
                  >
                    {revoking === item.code ? "Revoking…" : "Revoke"}
                  </Button>
                </View>
              </Surface>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
