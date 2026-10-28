import type { ReactNode } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { Drawer, Text, useTheme } from "@gryt/ui-native";
import { BellIcon } from "phosphor-react-native/src/icons/Bell";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { MagnifyingGlassIcon } from "phosphor-react-native/src/icons/MagnifyingGlass";
import { PushPinIcon } from "phosphor-react-native/src/icons/PushPin";

/** What a channel is for and what can be done with it, from a tap on its name (C38). */
export function ChannelSheet({
  open,
  onClose,
  name,
  description,
  onPins,
  onSearch,
  onNotifications,
  onMarkRead,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  description?: string;
  onPins?: () => void;
  onSearch?: () => void;
  onNotifications?: () => void;
  onMarkRead?: () => void;
}) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const about = description?.trim();
  // Closed first: what each row opens is a sheet of its own, and iOS shows one at a time.
  const then = (run?: () => void) => (run ? () => { onClose(); setTimeout(run, 350); } : undefined);
  const rows = [
    { key: "pins", label: "Pinned messages", icon: <PushPinIcon size={19} color={theme.color.muted} />, run: then(onPins) },
    { key: "search", label: "Search this channel", icon: <MagnifyingGlassIcon size={19} color={theme.color.muted} />, run: then(onSearch) },
    { key: "notify", label: "Notifications", icon: <BellIcon size={19} color={theme.color.muted} />, run: then(onNotifications) },
    { key: "read", label: "Mark as read", icon: <CheckIcon size={19} color={theme.color.muted} />, run: then(onMarkRead) },
  ].flatMap((r) => (r.run ? [{ ...r, run: r.run }] : []));

  return (
    <Drawer.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Drawer.Portal>
        <Drawer.Popup side="bottom" size={Math.min(0.75, (about ? 390 : 330) / height)}>
          <View style={{ paddingHorizontal: theme.space(4), gap: theme.space(3) }}>
            <Text style={{ color: theme.color.text, fontSize: 20, fontWeight: "700", paddingHorizontal: theme.space(1) }}>#{name}</Text>
            {about ? (
              <Text style={{ color: theme.color.muted, fontSize: 14.5, lineHeight: 21, paddingHorizontal: theme.space(1) }}>{about}</Text>
            ) : null}
            <View style={{ borderRadius: theme.radius.lg, overflow: "hidden", borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surfaceRaised }}>
              {rows.map((row, i) => (
                <Row key={row.key} icon={row.icon} label={row.label} onPress={row.run} first={i === 0} />
              ))}
            </View>
          </View>
        </Drawer.Popup>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function Row({ icon, label, onPress, first }: { icon: ReactNode; label: string; onPress: () => void; first: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(3),
        minHeight: 50,
        paddingHorizontal: theme.space(4),
        borderTopWidth: first ? 0 : 1,
        borderColor: theme.color.border,
        backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
      })}
    >
      {icon}
      <Text style={{ color: theme.color.text, fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}
