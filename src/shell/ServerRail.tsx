import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@gryt/ui-native";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";

import { ServerIcon } from "../servers/ServerIcon";
import { useShell } from "./ShellContext";
import { SERVER_RAIL_WIDTH } from "./twoPane";

/** Stops short of the time and wifi, which sit in the top right corner when held upright. */
const STATUS_ICONS_WIDTH = 130;
const ICON = 44;
/** Keeps the first icon out of the screen's rounded corner. */
const CORNER_CLEARANCE = 28;

/**
 * Your servers, always showing when open. A column sideways, and upright a row in the
 * status bar's band, which is otherwise empty. Closed keeps the switcher.
 */
export function ServerRail() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { servers, server, setServer, setAddServerOpen } = useShell();
  const row = height > width;

  const items = (
    <>
      {servers.map((s) => (
        <Pressable
          key={s.host}
          onPress={() => setServer(s.host)}
          accessibilityRole="tab"
          accessibilityState={{ selected: s.host === server?.host }}
          accessibilityLabel={s.name || s.host}
        >
          <ServerIcon host={s.host} name={s.name} size={ICON} active={s.host === server?.host} />
        </Pressable>
      ))}
      <Pressable
        onPress={() => setAddServerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Add a server"
        style={{
          width: ICON,
          height: ICON,
          borderRadius: ICON / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.color.surface,
        }}
      >
        <PlusIcon size={20} color={theme.color.text} />
      </Pressable>
    </>
  );

  if (row) {
    return (
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: STATUS_ICONS_WIDTH,
          height: insets.top,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: "center",
            gap: theme.space(2),
            paddingLeft: CORNER_CLEARANCE,
            paddingRight: theme.space(3),
          }}
        >
          {items}
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      style={{
        width: SERVER_RAIL_WIDTH,
        paddingTop: insets.top,
        borderRightWidth: 1,
        borderRightColor: theme.color.border,
      }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          alignItems: "center",
          gap: theme.space(2),
          paddingVertical: theme.space(3),
        }}
      >
        {items}
      </ScrollView>
    </View>
  );
}
