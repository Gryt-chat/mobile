import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AlertDialog,
  Button,
  Divider,
  Spinner,
  Surface,
  Text,
  TextField,
  useTheme,
  useToast,
} from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { MinusIcon } from "phosphor-react-native/src/icons/Minus";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";
import { ProhibitIcon } from "phosphor-react-native/src/icons/Prohibit";
import { TrashIcon } from "phosphor-react-native/src/icons/Trash";

import { useServerConnection } from "../connection/ConnectionsProvider";
import { useTabBarSpace } from "../shell/TabBar";
import {
  cellState,
  describeDeleteImpact,
  describeRules,
  describeSaveImpact,
  indexRules,
  nextCellState,
  orderRoles,
  permissionLabel,
  withCell,
  type CellState,
  type ChannelRule,
} from "./channelRules";

/**
 * Permission templates on the phone: the half of channel permissions that was
 * only ever on the desktop.
 *
 * server#113 stores templates and client#330 edits them. The phone could cope
 * with a channel it had lost (GRYT-804) but had no way to decide anything, so
 * a template could only be made by sitting down at a computer.
 *
 * **The matrix is one role at a time.** The desktop draws roles across and
 * permissions down, which is a grid you can read at a glance on a wide screen
 * and cannot fit on a phone at all. Thirteen permissions by however many roles
 * would either scroll in both directions or shrink past legibility. So the role
 * is picked at the top and the permissions are a plain list under it — one
 * column of the desktop's grid, drawn tall. The rows are the same rows in the
 * same order.
 *
 * **A cell cycles rather than offering three buttons.** Tapping goes inherit,
 * deny, allow, back to inherit, matching `nextCellState` and the web exactly.
 * Three segments per row would be one tap to any state instead of up to two,
 * but it is also three targets in the width left after a permission name, and
 * the two clients would then disagree about what a tap does.
 *
 * **`manage_roles`, not `manage_channels`.** A template is server-wide policy.
 * Choosing one for a channel is the channel-level act, and the server gates the
 * two events that way — this screen would be refused with the wrong one.
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

    /* Saving and deleting both end with the server broadcasting
     * `server:details` to everybody, and neither re-sends the template list —
     * only a `templates:list` does that. So the refresh hangs off the
     * broadcast rather than following the emit.
     *
     * Asking again straight after emitting is the obvious version and it
     * races: the handlers are async, and socket.io only promises the server
     * receives events in order, not that one finishes before the next starts.
     * The list can be read before the save has written, which answers with the
     * old rules and looks exactly like a save that did nothing. The desktop
     * waits 400ms instead; this is the same wait with the guess taken out. */
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
  const ordered = orderRoles(roles);
  const [roleId, setRoleId] = useState<string | null>(null);

  // The first role once they arrive, and never again — reselecting on every
  // render would throw somebody back to the first role each time a save came
  // back. Low rank first, so it lands on the role a channel is usually being
  // closed to.
  useEffect(() => {
    setRoleId((current) => current ?? ordered[0]?.id ?? null);
  }, [ordered]);

  const role = ordered.find((r) => r.id === roleId) ?? null;
  const index = indexRules(rules);

  return (
    <View style={{ gap: theme.space(4) }}>
      <TextField
        label="Name"
        value={name}
        onChangeText={onNameChange}
        placeholder="Owners only"
        editable={!saving}
      />

      {ordered.length === 0 || permissions.length === 0 ? (
        <Text style={{ color: theme.color.muted, fontSize: 14 }}>
          This server has no roles to set permissions for yet.
        </Text>
      ) : (
        <>
          <View style={{ gap: theme.space(2) }}>
            <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "600" }}>Role</Text>
            {/* Horizontal rather than a Select: the roles are the thing being
                switched between constantly while setting a template up, and a
                dropdown would be two taps for every switch. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: theme.space(2), paddingRight: theme.space(2) }}
            >
              {ordered.map((r) => (
                <Button
                  key={r.id}
                  size="small"
                  tone={r.id === roleId ? "primary" : "neutral"}
                  onPress={() => setRoleId(r.id)}
                >
                  {r.name}
                </Button>
              ))}
            </ScrollView>
          </View>

          {role && (
            <Surface level="surface" bordered radius="lg" style={{ overflow: "hidden" }}>
              {permissions.map((permission, i) => (
                <View key={permission}>
                  {i > 0 && <Divider />}
                  <PermissionRow
                    label={permissionLabel(permission)}
                    state={cellState(index, role.id, permission)}
                    inherited={role.permissions.includes(permission)}
                    roleName={role.name}
                    disabled={saving}
                    onPress={(next) => onRulesChange(withCell(rules, role.id, permission, next))}
                  />
                </View>
              ))}
            </Surface>
          )}
        </>
      )}

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

const STATE_WORD: Record<CellState, string> = {
  inherit: "Inherits",
  allow: "Allowed",
  deny: "Denied",
};

function PermissionRow({
  label,
  state,
  inherited,
  roleName,
  disabled,
  onPress,
}: {
  label: string;
  state: CellState;
  /** Whether the role holds this permission anyway, for what inherit shows. */
  inherited: boolean;
  roleName: string;
  disabled?: boolean;
  onPress: (next: CellState) => void;
}) {
  const theme = useTheme();

  const colour =
    state === "allow" ? theme.color.success : state === "deny" ? theme.color.danger : theme.color.muted;

  return (
    <Pressable
      onPress={() => onPress(nextCellState(state))}
      disabled={disabled}
      accessibilityRole="button"
      // The role is in the label because the row does not name it — the picker
      // above does, and a screen reader moving down the list would otherwise
      // lose track of which role it is setting.
      accessibilityLabel={`${label} for ${roleName}: ${STATE_WORD[state]}`}
      accessibilityHint="Cycles between inherit, denied and allowed"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: theme.space(2),
        paddingHorizontal: theme.space(3),
        paddingVertical: theme.space(3),
        backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
      })}
    >
      <Text style={{ color: theme.color.text, fontSize: 14, flex: 1 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(1) }}>
        <Text style={{ color: colour, fontSize: 12 }}>{STATE_WORD[state]}</Text>
        <StateIcon state={state} inherited={inherited} colour={colour} />
      </View>
    </Pressable>
  );
}

function StateIcon({
  state,
  inherited,
  colour,
}: {
  state: CellState;
  inherited: boolean;
  colour: string;
}) {
  if (state === "allow") return <CheckIcon size={16} color={colour} weight="bold" />;
  if (state === "deny") return <ProhibitIcon size={16} color={colour} weight="bold" />;
  // Inheriting. The icon shows what it inherits rather than nothing, so a list
  // of grey ticks reads as "this role can already do all of these" — a blank
  // would mean both allowed everywhere and denied everywhere, which is the
  // thing somebody opened this to find out.
  return inherited ? (
    <CheckIcon size={16} color={colour} />
  ) : (
    <MinusIcon size={16} color={colour} />
  );
}
