import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Spinner, Surface, Text, useTheme, useToast } from "@gryt/ui-native";
import { CaretDownIcon } from "phosphor-react-native/src/icons/CaretDown";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CaretUpIcon } from "phosphor-react-native/src/icons/CaretUp";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";

import { useServerConnection } from "../connection/ConnectionsProvider";
import { useTabBarSpace } from "../shell/TabBar";
import { NEW_ROLE } from "./roleDraft";
import { byRank, neighborId, OWNER_ROLE, ranksAfterMove, type RankedRole } from "./roleOrder";

interface RoleRow extends RankedRole {
  name: string;
  color: string | null;
  memberCount: number;
}

/**
 * Every role, high rank first, with a member count and up/down buttons in place of
 * the desktop's drag. Tapping a row opens `RoleEditorScreen` for the rest.
 */
export function RoleListScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const tabBarSpace = useTabBarSpace();
  const { socket, getAccessToken, online } = useServerConnection();

  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!socket || !online) return;
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    socket.emit("server:roles:definitions:list", { accessToken });
  }, [getAccessToken, online, socket]);

  useEffect(() => {
    if (!socket) return;

    const onDefinitions = (payload: { roles?: RoleRow[] }) => {
      if (payload?.roles) setRoles(payload.roles);
      setMoving(null);
    };
    const onUpdated = () => void refresh();
    const onError = (payload: { message?: string }) => {
      setMoving(null);
      if (payload?.message) toast.show({ description: payload.message, severity: "error" });
    };

    socket.on("server:roles:definitions", onDefinitions);
    socket.on("server:roles:definition:updated", onUpdated);
    socket.on("server:roles:definition:deleted", onUpdated);
    socket.on("server:error", onError);
    return () => {
      socket.off("server:roles:definitions", onDefinitions);
      socket.off("server:roles:definition:updated", onUpdated);
      socket.off("server:roles:definition:deleted", onUpdated);
      socket.off("server:error", onError);
    };
  }, [socket, refresh, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const move = async (roleId: string, direction: "up" | "down") => {
    if (!roles) return;
    const overId = neighborId(roles, roleId, direction);
    if (!overId) return;
    const changed = ranksAfterMove(roles, roleId, overId);
    if (changed.length === 0) return;
    const accessToken = await getAccessToken();
    if (!accessToken || !socket) return;
    setMoving(roleId);
    for (const change of changed) {
      const full = roles.find((r) => r.id === change.id);
      if (!full) continue;
      socket.emit("server:roles:definitions:save", { accessToken, roleId: change.id, rank: change.rank });
    }
  };

  const ordered = roles ? byRank(roles) as RoleRow[] : [];

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
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700", flex: 1 }}>Roles</Text>
        <Pressable
          onPress={() => router.push({ pathname: "/server-settings/role/[id]", params: { id: NEW_ROLE } } as never)}
          accessibilityRole="button"
          accessibilityLabel="New role"
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
          <PlusIcon size={20} color={theme.color.text} weight="bold" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.space(4),
          paddingBottom: theme.space(4) + tabBarSpace,
          gap: theme.space(2),
        }}
      >
        {roles === null ? (
          <View style={{ alignItems: "center", paddingVertical: theme.space(8) }}>
            <Spinner />
          </View>
        ) : (
          ordered.map((role, index) => (
            <Surface
              key={role.id}
              level="surface"
              bordered
              radius="lg"
              style={{ flexDirection: "row", alignItems: "center", padding: theme.space(2), gap: theme.space(2) }}
            >
              <View style={{ flexDirection: "column" }}>
                <Pressable
                  onPress={() => void move(role.id, "up")}
                  disabled={index === 0 || moving !== null || role.id === OWNER_ROLE}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${role.name} up`}
                  hitSlop={4}
                  style={{ opacity: index === 0 || role.id === OWNER_ROLE ? 0.3 : 1, padding: 2 }}
                >
                  <CaretUpIcon size={14} color={theme.color.muted} weight="bold" />
                </Pressable>
                <Pressable
                  onPress={() => void move(role.id, "down")}
                  disabled={index === ordered.length - 1 || moving !== null || role.id === OWNER_ROLE}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${role.name} down`}
                  hitSlop={4}
                  style={{ opacity: index === ordered.length - 1 || role.id === OWNER_ROLE ? 0.3 : 1, padding: 2 }}
                >
                  <CaretDownIcon size={14} color={theme.color.muted} weight="bold" />
                </Pressable>
              </View>

              <Pressable
                onPress={() =>
                  router.push({ pathname: "/server-settings/role/[id]", params: { id: role.id } } as never)
                }
                accessibilityRole="button"
                accessibilityLabel={`Edit ${role.name}`}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: theme.space(2) }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    backgroundColor: role.color || theme.color.muted,
                  }}
                />
                <Text style={{ color: theme.color.text, fontSize: 15, fontWeight: "600", flex: 1 }}>
                  {role.name}
                </Text>
                <Text style={{ color: theme.color.muted, fontSize: 12 }}>{role.memberCount}</Text>
              </Pressable>
            </Surface>
          ))
        )}
      </ScrollView>
    </View>
  );
}
