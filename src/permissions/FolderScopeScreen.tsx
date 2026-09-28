import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Spinner, Surface, Text, useTheme, useToast } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";

import { useServerConnection } from "../connection/ConnectionsProvider";
import { useTabBarSpace } from "../shell/TabBar";
import { PermissionMatrix, type MatrixRole } from "./PermissionMatrix";
import {
  describeFolderRules,
  sameChoice,
  sameRules,
  scopeChoiceFrom,
  scopeSetPayload,
  type ChannelRule,
  type ScopeChoice,
} from "./channelRules";

/**
 * Who can use one folder, and everything in it that follows it. As `ChannelScopeScreen`,
 * but for `server:folders:scope:get`/`:set` — a folder has nothing above it to follow.
 */

interface ScopePayload {
  folderId?: string;
  permissions?: string[];
  scopeId?: string | null;
  isTemplate?: boolean;
  name?: string | null;
  rules?: ChannelRule[];
  channelCount?: number;
}

interface Template {
  id: string;
  name: string | null;
  channelCount: number;
}

export function FolderScopeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const tabBarSpace = useTabBarSpace();
  const { socket, getAccessToken, online } = useServerConnection();
  const { id: folderId, name: folderName } = useLocalSearchParams<{ id: string; name?: string }>();

  const [loaded, setLoaded] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roles, setRoles] = useState<MatrixRole[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [channelCount, setChannelCount] = useState(0);

  const [saved, setSaved] = useState<ScopeChoice>({ kind: "everyone" });
  const [choice, setChoice] = useState<ScopeChoice>({ kind: "everyone" });
  const [savedRules, setSavedRules] = useState<ChannelRule[]>([]);
  const [rules, setRules] = useState<ChannelRule[]>([]);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!socket || !online || !folderId) return;
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    socket.emit("server:folders:scope:get", { accessToken, folderId });
    socket.emit("server:roles:definitions:list", { accessToken });
    socket.emit("server:permissions:templates:list", { accessToken });
  }, [folderId, getAccessToken, online, socket]);

  useEffect(() => {
    if (!socket) return;

    const onScope = (payload: ScopePayload) => {
      if (!payload || payload.folderId !== folderId) return;
      const next = scopeChoiceFrom(payload.scopeId ?? null, payload.isTemplate ?? false);
      setSaved(next);
      setChoice(next);
      setSavedRules(payload.rules ?? []);
      setRules(payload.rules ?? []);
      setTemplateName(payload.name ?? null);
      setChannelCount(payload.channelCount ?? 0);
      if (payload.permissions?.length) setPermissions(payload.permissions);
      setLoaded(true);
      setSaving(false);
    };

    const onRoles = (payload: { roles?: MatrixRole[] }) => {
      if (payload?.roles) setRoles(payload.roles);
    };

    const onTemplates = (payload: { templates?: Template[] }) => {
      if (payload?.templates) setTemplates(payload.templates);
    };

    const onError = (payload: { error?: string; message?: string }) => {
      setSaving(false);
      if (payload?.error === "forbidden") return;
      if (payload?.message) toast.show({ description: payload.message, severity: "error" });
    };

    socket.on("server:folders:scope", onScope);
    socket.on("server:roles:definitions", onRoles);
    socket.on("server:permissions:templates", onTemplates);
    socket.on("server:error", onError);
    return () => {
      socket.off("server:folders:scope", onScope);
      socket.off("server:roles:definitions", onRoles);
      socket.off("server:permissions:templates", onTemplates);
      socket.off("server:error", onError);
    };
  }, [folderId, socket, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    if (!socket || !online || !folderId) {
      toast.show({ description: "Not connected to the server.", severity: "error" });
      return;
    }
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    setSaving(true);
    socket.emit("server:folders:scope:set", { accessToken, folderId, ...scopeSetPayload(choice, rules) });
    router.back();
  };

  const roleNames = new Map(roles.map((r) => [r.id, r.name]));
  const chosenTemplate =
    choice.kind === "template" ? templates.find((t) => t.id === choice.templateId) : undefined;
  const unchanged = sameChoice(choice, saved) && (choice.kind !== "custom" || sameRules(rules, savedRules));

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
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700" }}>Permissions</Text>
          {folderName ? <Text style={{ color: theme.color.muted, fontSize: 12 }}>{folderName}</Text> : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.space(4),
          paddingBottom: theme.space(4) + tabBarSpace,
          gap: theme.space(4),
        }}
      >
        {!loaded ? (
          <View style={{ alignItems: "center", paddingVertical: theme.space(8) }}>
            <Spinner />
          </View>
        ) : (
          <>
            <Text style={{ color: theme.color.muted, fontSize: 12, lineHeight: 18 }}>
              Every channel in this folder follows these permissions unless it has its own.
              {channelCount > 0
                ? ` ${channelCount} channel${channelCount === 1 ? "" : "s"} follow${channelCount === 1 ? "s" : ""} it.`
                : ""}
            </Text>

            <View style={{ gap: theme.space(2) }}>
              <Option
                label="Everyone"
                hint="Anyone on the server can see and use the channels in this folder."
                selected={choice.kind === "everyone"}
                onPress={() => setChoice({ kind: "everyone" })}
              />

              {templates
                .filter((t) => t.name)
                .map((t) => (
                  <Option
                    key={t.id}
                    label={t.name as string}
                    hint={
                      t.channelCount <= 1
                        ? "A shared template."
                        : `Shared with ${t.channelCount - 1} other channel${t.channelCount === 2 ? "" : "s"}.`
                    }
                    selected={choice.kind === "template" && choice.templateId === t.id}
                    onPress={() => setChoice({ kind: "template", templateId: t.id })}
                  />
                ))}

              <Option
                label="Custom"
                hint="Rules for this folder only."
                selected={choice.kind === "custom"}
                onPress={() => setChoice({ kind: "custom" })}
              />
            </View>

            <Text style={{ color: theme.color.muted, fontSize: 12, lineHeight: 18 }}>
              {choice.kind === "everyone"
                ? "Everyone on the server can see and use the channels in this folder."
                : choice.kind === "template"
                  ? chosenTemplate?.name || templateName
                    ? `Follows the ${chosenTemplate?.name ?? templateName} template. Changing it there changes every channel on it.`
                    : "Follows a template."
                  : describeFolderRules(rules, roleNames)}
            </Text>

            {choice.kind === "custom" && (
              <PermissionMatrix
                roles={roles}
                permissions={permissions}
                rules={rules}
                onChange={setRules}
                disabled={saving}
              />
            )}

            <Button tone="primary" disabled={saving || unchanged} onPress={save}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Option({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}>
      <Surface
        level="surface"
        bordered
        radius="lg"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(3),
          padding: theme.space(3),
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: theme.color.text, fontSize: 15, fontWeight: "600" }}>{label}</Text>
          <Text style={{ color: theme.color.muted, fontSize: 12 }}>{hint}</Text>
        </View>
        {selected && <CheckIcon size={18} color={theme.color.accent} weight="bold" />}
      </Surface>
    </Pressable>
  );
}
