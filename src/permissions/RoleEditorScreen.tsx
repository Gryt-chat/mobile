import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Checkbox, Spinner, Surface, Switch, Text, TextField, useTheme, useToast } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";

import { useServerConnection } from "../connection/ConnectionsProvider";
import { useTabBarSpace } from "../shell/TabBar";
import { useConfirm } from "../ui/actionSheet";
import { NEW_ROLE, slugifyRoleId } from "./roleDraft";
import { nextUnusedPreset, ROLE_COLOR_PRESETS } from "./roleColors";
import { OWNER_ROLE } from "./roleOrder";
import { humanizePermission } from "./rolePermissionLabels";

interface RoleDefinition {
  id: string;
  name: string;
  color: string | null;
  rank: number;
  permissions: string[];
  isSystem: boolean;
  autoGrantAfterDays: number | null;
  autoGrantAfterMessages: number | null;
  grantableByInvite: boolean;
  mentionable?: boolean;
  memberCount: number;
}

interface EditorState {
  roles: RoleDefinition[];
  permissions: string[];
}

interface Draft {
  name: string;
  color: string | null;
  permissions: string[];
  autoGrantAfterDays: number | null;
  autoGrantAfterMessages: number | null;
  grantableByInvite: boolean;
  mentionable: boolean;
}

const emptyDraft = (color: string): Draft => ({
  name: "",
  color,
  permissions: [],
  autoGrantAfterDays: null,
  autoGrantAfterMessages: null,
  grantableByInvite: false,
  mentionable: false,
});

/**
 * One role: name, colour, whether it can be mentioned or handed out by invite, given
 * out automatically, its permissions, and delete. Order lives on `RoleListScreen`.
 */
export function RoleEditorScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const confirm = useConfirm();
  const tabBarSpace = useTabBarSpace();
  const { socket, getAccessToken, online } = useServerConnection();
  const { id } = useLocalSearchParams<{ id: string }>();
  const creating = id === NEW_ROLE;

  const [state, setState] = useState<EditorState | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const loadedFor = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!socket || !online) return;
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    socket.emit("server:roles:definitions:list", { accessToken });
  }, [getAccessToken, online, socket]);

  useEffect(() => {
    if (!socket) return;
    const onDefinitions = (payload: EditorState) => {
      if (payload?.roles) setState(payload);
    };
    const onError = (payload: { message?: string }) => {
      if (payload?.message) toast.show({ description: payload.message, severity: "error" });
    };
    socket.on("server:roles:definitions", onDefinitions);
    socket.on("server:error", onError);
    return () => {
      socket.off("server:roles:definitions", onDefinitions);
      socket.off("server:error", onError);
    };
  }, [socket, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const role = state?.roles.find((r) => r.id === id) ?? null;

  // Loaded once per role id, not on every server echo, so a field this screen just
  // saved is not overwritten by the round trip confirming it.
  useEffect(() => {
    if (creating) {
      if (loadedFor.current === NEW_ROLE) return;
      loadedFor.current = NEW_ROLE;
      setDraft(emptyDraft(nextUnusedPreset((state?.roles ?? []).map((r) => r.color))));
      return;
    }
    if (!role || loadedFor.current === role.id) return;
    loadedFor.current = role.id;
    setDraft({
      name: role.name,
      color: role.color,
      permissions: [...role.permissions],
      autoGrantAfterDays: role.autoGrantAfterDays,
      autoGrantAfterMessages: role.autoGrantAfterMessages,
      grantableByInvite: role.grantableByInvite,
      mentionable: role.mentionable ?? false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creating, role?.id]);

  const emit = async (payload: Record<string, unknown>) => {
    if (!socket || !online) {
      toast.show({ description: "Not connected to the server.", severity: "error" });
      return;
    }
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    socket.emit("server:roles:definitions:save", { accessToken, ...payload });
  };

  const commit = (patch: Partial<Draft>) => {
    if (!draft || creating) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    void emit({
      roleId: id,
      name: next.name,
      color: next.color,
      permissions: next.permissions,
      autoGrantAfterDays: next.autoGrantAfterDays,
      autoGrantAfterMessages: next.autoGrantAfterMessages,
      grantableByInvite: next.grantableByInvite,
      mentionable: next.mentionable,
    });
  };

  const saveOwnerColor = (color: string | null) => {
    setDraft((d) => (d ? { ...d, color } : d));
    void emit({ roleId: OWNER_ROLE, color });
  };

  const togglePermission = (permissionId: string, on: boolean) => {
    if (!draft) return;
    const next = on
      ? draft.permissions.includes(permissionId) ? draft.permissions : [...draft.permissions, permissionId]
      : draft.permissions.filter((p) => p !== permissionId);
    setDraft({ ...draft, permissions: next });
    if (!creating) commit({ permissions: next });
  };

  const create = async () => {
    if (!draft) return;
    const roleId = slugifyRoleId(draft.name);
    if (!roleId) return;
    if (state?.roles.some((r) => r.id === roleId)) {
      toast.show({ description: `There is already a role called "${draft.name}".`, severity: "error" });
      return;
    }
    setCreatingBusy(true);
    await emit({
      roleId,
      name: draft.name,
      color: draft.color,
      permissions: draft.permissions,
      autoGrantAfterDays: draft.autoGrantAfterDays,
      autoGrantAfterMessages: draft.autoGrantAfterMessages,
      grantableByInvite: draft.grantableByInvite,
      mentionable: draft.mentionable,
    });
    setCreatingBusy(false);
    router.back();
  };

  const remove = async () => {
    if (!role) return;
    const sure = await confirm({
      title: `Delete ${role.name}?`,
      message:
        role.memberCount > 0
          ? `${role.memberCount} member${role.memberCount === 1 ? "" : "s"} holding it moves to the default role.`
          : "Nobody holds this role right now.",
      confirm: "Delete",
    });
    if (!sure) return;
    if (!socket || !online) return;
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    socket.emit("server:roles:definitions:delete", { accessToken, roleId: role.id });
    router.back();
  };

  const title = creating ? "New role" : role?.name || "Role";

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
          accessibilityLabel="Back to the role list"
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
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700", flex: 1 }} numberOfLines={1}>
          {title}
        </Text>
      </View>

      {!draft || !state ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Spinner />
        </View>
      ) : !creating && !role ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space(6) }}>
          <Text style={{ color: theme.color.muted, fontSize: 14, textAlign: "center" }}>
            This role is gone — somebody else likely deleted it.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: theme.space(4),
            paddingBottom: theme.space(4) + tabBarSpace,
            gap: theme.space(4),
          }}
        >
          {!creating && id === OWNER_ROLE ? (
            <>
              <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 19 }}>
                The owner holds every permission. Its name, rank and permissions cannot be
                changed — only its colour, which is the only thing here that is purely cosmetic.
              </Text>
              <ColorField value={draft.color} onPick={saveOwnerColor} />
            </>
          ) : (
            <>
              <TextField
                label="Name"
                value={draft.name}
                onChangeText={(v) => setDraft({ ...draft, name: v.slice(0, 32) })}
                onBlur={() => commit({})}
                placeholder="Name this role"
              />
              {creating && (
                <Text style={{ color: theme.color.muted, fontSize: 12 }}>
                  id: {slugifyRoleId(draft.name) || "…"}
                </Text>
              )}

              <ColorField value={draft.color} onPick={(color) => commit({ color })} />

              <View style={{ gap: theme.space(1) }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "600" }}>
                    Anyone can mention this role
                  </Text>
                  <Switch checked={draft.mentionable} onCheckedChange={(v) => commit({ mentionable: v })} />
                </View>
                <Text style={{ color: theme.color.muted, fontSize: 12, lineHeight: 17 }}>
                  Off, only people with "Mention Everyone" can ping it, and anyone else's
                  mention goes out as plain text.
                </Text>
              </View>

              {!role?.isSystem && (
                <>
                  <View style={{ gap: theme.space(1) }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "600" }}>
                        Can be given out by an invite
                      </Text>
                      <Switch
                        checked={draft.grantableByInvite}
                        onCheckedChange={(v) => commit({ grantableByInvite: v })}
                      />
                    </View>
                    <Text style={{ color: theme.color.muted, fontSize: 12, lineHeight: 17 }}>
                      Whoever joins on that link arrives holding it. Admin, owner and any role
                      that can hand out permissions can never be given out this way.
                    </Text>
                  </View>

                  <View style={{ gap: theme.space(2) }}>
                    <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "600" }}>
                      Given out automatically
                    </Text>
                    <Text style={{ color: theme.color.muted, fontSize: 12, lineHeight: 17 }}>
                      Leave both blank for by-hand only. Fill both in and somebody gets it once
                      they have been here that long and posted that many messages.
                    </Text>
                    <View style={{ flexDirection: "row", gap: theme.space(3) }}>
                      <TextField
                        label="After days"
                        style={{ flex: 1 }}
                        keyboardType="number-pad"
                        value={draft.autoGrantAfterDays === null ? "" : String(draft.autoGrantAfterDays)}
                        onChangeText={(v) =>
                          setDraft({ ...draft, autoGrantAfterDays: v.trim() ? Number(v) : null })
                        }
                        onBlur={() => commit({})}
                        placeholder="—"
                      />
                      <TextField
                        label="After messages"
                        style={{ flex: 1 }}
                        keyboardType="number-pad"
                        value={draft.autoGrantAfterMessages === null ? "" : String(draft.autoGrantAfterMessages)}
                        onChangeText={(v) =>
                          setDraft({ ...draft, autoGrantAfterMessages: v.trim() ? Number(v) : null })
                        }
                        onBlur={() => commit({})}
                        placeholder="—"
                      />
                    </View>
                  </View>
                </>
              )}

              <View style={{ gap: theme.space(2) }}>
                <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "600" }}>Permissions</Text>
                <Surface level="surface" bordered radius="lg" style={{ overflow: "hidden" }}>
                  {state.permissions.map((permissionId, i) => (
                    <View
                      key={permissionId}
                      style={{
                        borderTopWidth: i > 0 ? 1 : 0,
                        borderColor: theme.color.border,
                        paddingHorizontal: theme.space(3),
                        paddingVertical: theme.space(2),
                      }}
                    >
                      <Checkbox
                        checked={draft.permissions.includes(permissionId)}
                        onCheckedChange={(v) => togglePermission(permissionId, v)}
                        label={humanizePermission(permissionId)}
                      />
                    </View>
                  ))}
                </Surface>
              </View>

              {creating ? (
                <Button tone="primary" disabled={!slugifyRoleId(draft.name) || creatingBusy} onPress={() => void create()}>
                  {creatingBusy ? "Creating…" : "Create role"}
                </Button>
              ) : !role?.isSystem ? (
                <Button tone="danger" onPress={() => void remove()}>
                  Delete role
                </Button>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function ColorField({ value, onPick }: { value: string | null; onPick: (color: string | null) => void }) {
  const theme = useTheme();
  const [customText, setCustomText] = useState(value ?? "");
  const isPreset = value ? ROLE_COLOR_PRESETS.some((p) => p.value.toLowerCase() === value.toLowerCase()) : false;

  return (
    <View style={{ gap: theme.space(2) }}>
      <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "600" }}>Colour</Text>
      <View style={{ flexDirection: "row", gap: theme.space(2), flexWrap: "wrap" }}>
        {ROLE_COLOR_PRESETS.map((preset) => {
          const active = value?.toLowerCase() === preset.value.toLowerCase();
          return (
            <Pressable
              key={preset.value}
              onPress={() => onPick(preset.value)}
              accessibilityRole="button"
              accessibilityLabel={preset.name}
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                backgroundColor: preset.value,
                borderWidth: active ? 2 : 0,
                borderColor: theme.color.text,
              }}
            />
          );
        })}
      </View>
      <TextField
        label="Custom hex"
        value={isPreset ? "" : customText}
        onChangeText={setCustomText}
        onBlur={() => {
          const trimmed = customText.trim();
          if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) onPick(trimmed.toLowerCase());
        }}
        placeholder="#888888"
        autoCapitalize="none"
      />
    </View>
  );
}
