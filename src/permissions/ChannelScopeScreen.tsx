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
  describeChoice,
  sameChoice,
  scopeChoiceFrom,
  scopeSetPayload,
  type ChannelRule,
  type ScopeChoice,
} from "./channelRules";

/**
 * Who can use one channel.
 *
 * The other half of GRYT-805. That screen edits a template, which is
 * server-wide policy; this points one channel at Everyone, at a template, or at
 * rules of its own.
 *
 * **`manage_channels`, not `manage_roles`.** Choosing a scope for a channel is
 * the channel-level act, and the server gates `server:channels:scope:set` that
 * way. The templates screen is the other permission, and the two are
 * deliberately different.
 *
 * **A template is never edited from here.** Picking one sends the id and no
 * rules. Editing its rules from a screen titled with one channel's name would
 * change every other channel using it, which is the opposite of what anybody
 * would expect — and the count that makes that decision legible is on the
 * templates screen, not this one. `scopeSetPayload` is where that is enforced
 * and it has a test named for it.
 */

interface ScopePayload {
  channelId?: string;
  permissions?: string[];
  scopeId?: string | null;
  isTemplate?: boolean;
  name?: string | null;
  rules?: ChannelRule[];
}

interface Template {
  id: string;
  name: string | null;
  channelCount: number;
}

export function ChannelScopeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const tabBarSpace = useTabBarSpace();
  const { socket, getAccessToken, online } = useServerConnection();
  const { id: channelId, name: channelName } = useLocalSearchParams<{ id: string; name?: string }>();

  const [loaded, setLoaded] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roles, setRoles] = useState<MatrixRole[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateName, setTemplateName] = useState<string | null>(null);

  const [saved, setSaved] = useState<ScopeChoice>({ kind: "everyone" });
  const [choice, setChoice] = useState<ScopeChoice>({ kind: "everyone" });
  const [rules, setRules] = useState<ChannelRule[]>([]);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!socket || !online || !channelId) return;
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    socket.emit("server:channels:scope:get", { accessToken, channelId });
    // The matrix needs roles and what each already holds, so an inheriting cell
    // can show what it is inheriting.
    socket.emit("server:roles:definitions:list", { accessToken });
    /* Templates need `manage_roles`, which this screen does not require —
     * `scope:get` gates on `manage_channels`. So somebody who may edit a
     * channel but not roles gets `forbidden` here and no template list, and the
     * picker below falls back to Everyone and Custom.
     *
     * That is the server's shape rather than a decision made here, and the web
     * client behaves the same way. Worth knowing before reading the empty list
     * as "this server has no templates". */
    socket.emit("server:permissions:templates:list", { accessToken });
  }, [channelId, getAccessToken, online, socket]);

  useEffect(() => {
    if (!socket) return;

    const onScope = (payload: ScopePayload) => {
      // Another channel's answer, arriving because the socket is shared.
      if (!payload || payload.channelId !== channelId) return;
      const next = scopeChoiceFrom(payload.scopeId ?? null, payload.isTemplate ?? false);
      setSaved(next);
      setChoice(next);
      setRules(payload.rules ?? []);
      setTemplateName(payload.name ?? null);
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
      /* `forbidden` on the template list is expected for somebody holding
       * `manage_channels` without `manage_roles`, and saying so would be noise
       * on a screen that works fine without templates. Everything else is worth
       * showing. */
      if (payload?.error === "forbidden") return;
      if (payload?.message) toast.show({ description: payload.message, severity: "error" });
    };

    socket.on("server:channels:scope", onScope);
    socket.on("server:roles:definitions", onRoles);
    socket.on("server:permissions:templates", onTemplates);
    socket.on("server:error", onError);
    return () => {
      socket.off("server:channels:scope", onScope);
      socket.off("server:roles:definitions", onRoles);
      socket.off("server:permissions:templates", onTemplates);
      socket.off("server:error", onError);
    };
  }, [channelId, socket, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async () => {
    if (!socket || !online || !channelId) {
      toast.show({ description: "Not connected to the server.", severity: "error" });
      return;
    }
    const accessToken = await getAccessToken();
    if (!accessToken) return;

    setSaving(true);
    socket.emit("server:channels:scope:set", {
      accessToken,
      channelId,
      ...scopeSetPayload(choice, rules),
    });
    router.back();
  };

  const roleNames = new Map(roles.map((r) => [r.id, r.name]));
  const chosenTemplate =
    choice.kind === "template" ? templates.find((t) => t.id === choice.templateId) : undefined;
  const unchanged = sameChoice(choice, saved) && choice.kind !== "custom";

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
          <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700" }}>
            Permissions
          </Text>
          {channelName && (
            <Text style={{ color: theme.color.muted, fontSize: 12 }}>{channelName}</Text>
          )}
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
            <View style={{ gap: theme.space(2) }}>
              <Option
                label="Everyone"
                hint="Anyone on the server can see and use this channel."
                selected={choice.kind === "everyone"}
                onPress={() => setChoice({ kind: "everyone" })}
              />

              {/* Templates before Custom, deliberately. The whole point of a
                  template is that reaching for Custom is the uncommon choice,
                  and a list that puts the escape hatch first invites it. */}
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
                hint="Rules for this channel only."
                selected={choice.kind === "custom"}
                onPress={() => setChoice({ kind: "custom" })}
              />
            </View>

            <Text style={{ color: theme.color.muted, fontSize: 12, lineHeight: 18 }}>
              {describeChoice(choice, chosenTemplate?.name ?? templateName, rules, roleNames)}
            </Text>

            {/* Only Custom draws the matrix. A template's rules belong to the
                template, and showing them here as though they were editable
                would be an invitation to change every channel on it. */}
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
