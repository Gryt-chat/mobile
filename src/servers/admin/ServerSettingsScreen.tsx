import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Surface, Text, useTheme } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
import { FolderIcon } from "phosphor-react-native/src/icons/Folder";
import { LinkIcon } from "phosphor-react-native/src/icons/Link";
import { ShieldCheckIcon } from "phosphor-react-native/src/icons/ShieldCheck";
import { SmileyIcon } from "phosphor-react-native/src/icons/Smiley";

import { useServerConnection } from "../../connection/ConnectionsProvider";
import { type AdminSection, visibleAdminSections } from "./sections";

const SECTION_META: Record<AdminSection, { label: string; hint: string; icon: typeof LinkIcon; route: string }> = {
  invites: {
    label: "Invites",
    hint: "Codes that let people in",
    icon: LinkIcon,
    route: "/server-settings/invites",
  },
  folders: {
    label: "Folders",
    hint: "Group channels, and who can use them",
    icon: FolderIcon,
    route: "/server-settings/folders",
  },
  emojis: {
    label: "Emojis",
    hint: "This server's own emoji",
    icon: SmileyIcon,
    route: "/server-settings/emojis",
  },
  roles: {
    label: "Roles",
    hint: "What each role may do",
    icon: ShieldCheckIcon,
    route: "/server-settings/roles",
  },
};

/**
 * The front door for everything under Server settings. What is behind it depends on
 * what this account holds — the same permissions the desktop's settings dialog gates on.
 */
export function ServerSettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { state } = useServerConnection();
  const info = state.status === "ready" ? state.details : undefined;
  const sections = visibleAdminSections(info);

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
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700", flex: 1 }}>
          Server settings
        </Text>
      </View>

      <View style={{ padding: theme.space(4), gap: theme.space(2) }}>
        {sections.length === 0 ? (
          <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 20 }}>
            Your role does not include any of the permissions these settings need.
          </Text>
        ) : (
          sections.map((section) => {
            const meta = SECTION_META[section];
            const Icon = meta.icon;
            return (
              <Pressable
                key={section}
                onPress={() => router.push(meta.route as never)}
                accessibilityRole="button"
                accessibilityLabel={meta.label}
              >
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
                  <Icon size={20} color={theme.color.muted} weight="bold" />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: theme.color.text, fontSize: 15, fontWeight: "600" }}>
                      {meta.label}
                    </Text>
                    <Text style={{ color: theme.color.muted, fontSize: 12 }}>{meta.hint}</Text>
                  </View>
                  <CaretRightIcon size={16} color={theme.color.muted} />
                </Surface>
              </Pressable>
            );
          })
        )}
      </View>
    </View>
  );
}
