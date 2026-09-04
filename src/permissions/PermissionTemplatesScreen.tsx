import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AlertDialog,
  Button,
  Spinner,
  Surface,
  Text,
  TextField,
  useTheme,
  useToast,
} from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";
import { TrashIcon } from "phosphor-react-native/src/icons/Trash";

import { useServerConnection } from "../connection/ConnectionsProvider";
import { useTabBarSpace } from "../shell/TabBar";
import { PermissionMatrix } from "./PermissionMatrix";
import {
  describeDeleteImpact,
  describeRules,
  describeSaveImpact,
  type ChannelRule,
} from "./channelRules";

/**
 * Permission templates on the phone: the half of channel permissions that was
 * only ever on the desktop (GRYT-804).
 *
 * **The matrix is one role at a time.** The desktop's grid of roles across and
 * permissions down does not fit a phone at either scroll direction or size, so
 * the role is picked at the top and the permissions are one column drawn tall.
 * Same rows, same order.
 *
 * **A cell cycles rather than offering three buttons**, matching `nextCellState`
 * and the web exactly — three segments would fit badly and would have the two
 * clients disagree about what a tap does.
 *
 * **`manage_roles`, not `manage_channels`.** A template is server-wide policy,
 * and the server gates the two events that way.
 */

interface Template {
  id: string;
  name: string | null;
  isSystem: boolean;
  channelCount: number;
  rules: ChannelRule[];
}

interface Role {
  id: string;
  name: string;
  rank: number;
  permissions: string[];
}

/** Marks a template that has not been saved, so it has no server id yet. */
const NEW_TEMPLATE = "__new__";

export function PermissionTemplatesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  /* The tab bar floats over the content — this screen is pushed inside the
   * tabs, so the bar stays visible and the last thing on the page sits under
   * it unless the room is reserved here. The hook already includes the bottom
   * inset. */
  const tabBarSpace = useTabBarSpace();
  const { socket, getAccessToken, online } = useServerConnection();

  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftRules, setDraftRules] = useState<ChannelRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Template | null>(null);

  const refresh = useCallback(async () => {
    if (!socket || !online) return;
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    socket.emit("server:permissions:templates:list", { accessToken });
    // The matrix needs the roles and what each one already holds, so an
    // inheriting cell can show what it is inheriting rather than nothing.
    socket.emit("server:roles:definitions:list", { accessToken });
  }, [getAccessToken, online, socket]);

  useEffect(() => {
    if (!socket) return;

    const onTemplates = (payload: { permissions?: string[]; templates?: Template[] }) => {
      if (!payload?.templates) return;
      setTemplates(payload.templates);
      if (payload.permissions?.length) setPermissions(payload.permissions);
      setSaving(false);

      // Somebody else saving while this is open replaces what is here rather
      // than merging into it, the same as the desktop. Merging two people's
      // matrices would produce a policy neither of them chose.
      setEditing((current) => {
        if (current === null || current === NEW_TEMPLATE) return current;
        const still = payload.templates?.find((t) => t.id === current);
        if (!still) return null;
        setDraftName(still.name ?? "");
        setDraftRules(still.rules);
        return current;
      });
    };

    const onRoles = (payload: { roles?: Role[] }) => {
      if (payload?.roles) setRoles(payload.roles);
    };

    const onError = (payload: { error?: string; message?: string }) => {
      // The server answers `forbidden` when the account lacks `manage_roles`.
      // Saying so beats an empty list, which reads as "this server has none".
      setSaving(false);
      if (payload?.message) toast.show({ description: payload.message, severity: "error" });
    };

    /* **The refresh hangs off the `server:details` broadcast, not the emit.**
     * Asking again straight after emitting races: socket.io promises the server
     * receives events in order, not that one finishes before the next starts,
     * so the list can be read before the save has written and look exactly like
     * a save that did nothing. The desktop waits 400ms instead. */
    const onDetails = () => void refresh();

    socket.on("server:permissions:templates", onTemplates);
    socket.on("server:roles:definitions", onRoles);
    socket.on("server:details", onDetails);
    socket.on("server:error", onError);
    return () => {
      socket.off("server:permissions:templates", onTemplates);
      socket.off("server:roles:definitions", onRoles);
      socket.off("server:details", onDetails);
      socket.off("server:error", onError);
    };
  }, [refresh, socket, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = templates?.find((t) => t.id === editing) ?? null;
  const isNew = editing === NEW_TEMPLATE;

  const roleNames = new Map(roles.map((r) => [r.id, r.name]));

  const openTemplate = (template: Template) => {
    setEditing(template.id);
    setDraftName(template.name ?? "");
    setDraftRules(template.rules);
  };

  const startNew = () => {
    setEditing(NEW_TEMPLATE);
    setDraftName("");
    setDraftRules([]);
  };

  const save = async () => {
    const name = draftName.trim();
    if (!name) {
      toast.show({ description: "Give the template a name first.", severity: "error" });
      return;
    }
    if (!socket || !online) {
      toast.show({ description: "Not connected to the server.", severity: "error" });
      return;
    }
    const accessToken = await getAccessToken();
    if (!accessToken) return;

    setSaving(true);
    socket.emit("server:permissions:template:save", {
      accessToken,
      // Absent for a new one, so the server mints the id. Sending NEW_TEMPLATE
      // would create a template literally called __new__ and reuse it for the
      // next one.
      templateId: isNew ? undefined : editing,
      name,
      // The whole matrix, not a patch. A cell put back to inherit is a rule
      // absent from this list, and the server deletes what it is not sent —
      // patching would make inherit unreachable once anything else was set.
      rules: draftRules,
    });
    setEditing(null);
  };

  const remove = async (template: Template) => {
    setConfirmDelete(null);
    if (!socket || !online) return;
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    socket.emit("server:permissions:template:delete", { accessToken, templateId: template.id });
    if (editing === template.id) setEditing(null);
  };

  const title = editing === null ? "Permission templates" : isNew ? "New template" : "Edit template";

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      {/* The same hand-rolled header Preferences has, for the same reason: the
          root Stack runs with `headerShown: false` so a screen owns its top. */}
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
          // Back out of the editor first, and off the screen only from the
          // list. Otherwise the one gesture people use to undo a change they
          // did not mean to make would take them off the screen entirely.
          onPress={() => (editing === null ? router.back() : setEditing(null))}
          accessibilityRole="button"
          accessibilityLabel={editing === null ? "Back" : "Back to the template list"}
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
          {title}
        </Text>
        {editing === null && templates !== null && (
          <Pressable
            onPress={startNew}
            accessibilityRole="button"
            accessibilityLabel="New template"
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
        )}
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.space(4),
          paddingBottom: theme.space(4) + tabBarSpace,
          gap: theme.space(4),
        }}
      >
        {editing === null ? (
          <TemplateList
            templates={templates}
            roleNames={roleNames}
            onOpen={openTemplate}
            onDelete={setConfirmDelete}
          />
        ) : (
          <TemplateEditor
            name={draftName}
            onNameChange={setDraftName}
            rules={draftRules}
            onRulesChange={setDraftRules}
            roles={roles}
            permissions={permissions}
            saving={saving}
            impact={selected ? describeSaveImpact(selected.channelCount) : null}
            onSave={save}
          />
        )}
      </ScrollView>

      {/*
        An `AlertDialog` rather than a `Dialog`: this one cannot be dismissed by
        tapping outside, which is the right shape for a destructive answer and
        the wrong one for a question where cancelling is safe. The join dialog
        in `ServerScreen` is the other way round for that reason.

        Mounted always and driven by `open`, like that one. Rendering it behind
        `confirmDelete && …` unmounts a `Modal` while it is still dismissing,
        which is how iOS ends up showing a scrim with no panel under it.

        There is no `AlertDialog.Footer` — the kit does not export one, matching
        the web — so the buttons are a plain row.
      */}
      <AlertDialog.Root
        open={confirmDelete !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Popup>
            <AlertDialog.Title>Delete {confirmDelete?.name}?</AlertDialog.Title>
            {/* The count, before it happens. Deleting only widens access, so
                there is no eviction to warn about — but "nine channels" is
                still the number somebody wants before they answer. */}
            <AlertDialog.Description>
              {confirmDelete ? describeDeleteImpact(confirmDelete.channelCount) : ""}
            </AlertDialog.Description>
            <View style={{ flexDirection: "row", gap: theme.space(2), marginTop: theme.space(3) }}>
              <Button
                tone="danger"
                onPress={() => {
                  /* Read from state rather than a closure over the row: the
                   * dialog is one component and the row that opened it has
                   * re-rendered since. */
                  if (confirmDelete) void remove(confirmDelete);
                }}
              >
                Delete
              </Button>
              <Button tone="ghost" onPress={() => setConfirmDelete(null)}>
                Cancel
              </Button>
            </View>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </View>
  );
}

function TemplateList({
  templates,
  roleNames,
  onOpen,
  onDelete,
}: {
  templates: Template[] | null;
  roleNames: Map<string, string>;
  onOpen: (t: Template) => void;
  onDelete: (t: Template) => void;
}) {
  const theme = useTheme();

  // Null is "nothing has arrived", empty is "the server has none". Drawing the
  // empty state during the first round trip would tell somebody the server has
  // no templates a moment before showing them nine.
  if (templates === null) {
    return (
      <View style={{ alignItems: "center", paddingVertical: theme.space(8) }}>
        <Spinner />
      </View>
    );
  }

  if (templates.length === 0) {
    return (
      <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 20 }}>
        No templates yet. Channels can still have their own permissions — a template is for when
        several of them should match, so changing one changes all of them.
      </Text>
    );
  }

  return (
    <View style={{ gap: theme.space(2) }}>
      {templates.map((template) => (
        <Surface
          key={template.id}
          level="surface"
          bordered
          radius="lg"
          style={{ flexDirection: "row", alignItems: "center", padding: theme.space(3), gap: theme.space(2) }}
        >
          <Pressable
            onPress={() => onOpen(template)}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${template.name}`}
            style={{ flex: 1, gap: 2 }}
          >
            <Text style={{ color: theme.color.text, fontSize: 15, fontWeight: "600" }}>
              {template.name}
            </Text>
            {/* The count that decides whether an edit here is small or
                frightening, so it sits on the row rather than behind a tap. */}
            <Text style={{ color: theme.color.muted, fontSize: 12 }}>
              {template.channelCount === 0
                ? "Not used by any channel yet"
                : `Used by ${template.channelCount} channel${template.channelCount === 1 ? "" : "s"}`}
            </Text>
            <Text style={{ color: theme.color.muted, fontSize: 12 }}>
              {describeRules(template.rules, roleNames)}
            </Text>
          </Pressable>
          {!template.isSystem && (
            <Pressable
              onPress={() => onDelete(template)}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${template.name}`}
              hitSlop={8}
              style={{ padding: theme.space(1) }}
            >
              <TrashIcon size={18} color={theme.color.muted} />
            </Pressable>
          )}
        </Surface>
      ))}
    </View>
  );
}

function TemplateEditor({
  name,
  onNameChange,
  rules,
  onRulesChange,
  roles,
  permissions,
  saving,
  impact,
  onSave,
}: {
  name: string;
  onNameChange: (next: string) => void;
  rules: ChannelRule[];
  onRulesChange: (next: ChannelRule[]) => void;
  roles: Role[];
  permissions: string[];
  saving: boolean;
  impact: string | null;
  onSave: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.space(4) }}>
      <TextField
        label="Name"
        value={name}
        onChangeText={onNameChange}
        placeholder="Owners only"
        editable={!saving}
      />

      <PermissionMatrix
        roles={roles}
        permissions={permissions}
        rules={rules}
        onChange={onRulesChange}
        disabled={saving}
      />

      {/* Said before the save, not after. By the time it lands, anybody in a
          voice room they can no longer see has already been removed. */}
      {impact && (
        <Text style={{ color: theme.color.muted, fontSize: 12, lineHeight: 18 }}>{impact}</Text>
      )}

      <Button tone="primary" disabled={saving} onPress={onSave}>
        {saving ? "Saving…" : "Save template"}
      </Button>
    </View>
  );
}
