import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Button, Divider, Surface, Text, useTheme } from "@gryt/ui-native";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { MinusIcon } from "phosphor-react-native/src/icons/Minus";
import { ProhibitIcon } from "phosphor-react-native/src/icons/Prohibit";

import {
  cellState,
  indexRules,
  nextCellState,
  orderRoles,
  permissionLabel,
  withCell,
  type CellState,
  type ChannelRule,
} from "./channelRules";

export interface MatrixRole {
  id: string;
  name: string;
  rank: number;
  permissions: string[];
}

/**
 * What a scope changes, per role — one role at a time.
 *
 * Shared by the templates screen and the per-channel screen, which is the whole
 * reason it is a component. Two grids drawn from the same rules would drift,
 * and the one people would find out about is the one that disagrees with the
 * server.
 *
 * The desktop draws roles across and permissions down. That reads at a glance
 * on a wide screen and does not fit a phone at all — thirteen permissions by
 * however many roles either scrolls in two directions or shrinks past reading.
 * So the role is picked at the top and the permissions are a list under it: one
 * column of the desktop's grid, drawn tall, same rows in the same order.
 *
 * A cell cycles inherit, deny, allow, back. Deny first, because taking
 * something away is what people open this to do.
 */
export function PermissionMatrix({
  roles,
  permissions,
  rules,
  onChange,
  disabled,
}: {
  roles: MatrixRole[];
  /** The permissions this server will scope, in the server's own order. */
  permissions: string[];
  rules: ChannelRule[];
  onChange: (next: ChannelRule[]) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const ordered = orderRoles(roles);
  const [roleId, setRoleId] = useState<string | null>(null);

  // The first role once they arrive, and never again — reselecting every render
  // would throw somebody back to the first role each time a save came back.
  // Low rank first, so it lands on the role a channel is usually closed to.
  useEffect(() => {
    setRoleId((current) => current ?? ordered[0]?.id ?? null);
  }, [ordered]);

  const role = ordered.find((r) => r.id === roleId) ?? null;
  const index = indexRules(rules);

  if (ordered.length === 0 || permissions.length === 0) {
    return (
      <Text style={{ color: theme.color.muted, fontSize: 14 }}>
        This server has no roles to set permissions for yet.
      </Text>
    );
  }

  return (
    <View style={{ gap: theme.space(3) }}>
      <View style={{ gap: theme.space(2) }}>
        <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "600" }}>Role</Text>
        {/* Horizontal rather than a Select: roles are switched between
            constantly while setting permissions up, and a dropdown would be two
            taps for every switch. */}
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
                disabled={disabled}
                onPress={(next) => onChange(withCell(rules, role.id, permission, next))}
              />
            </View>
          ))}
        </Surface>
      )}
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
