import { useState } from "react";
import { Image, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { getServerHttpBase } from "./address";
import { initialsFor } from "./initials";

/**
 * A server's icon, or its initials.
 *
 * `/icon` is unauthenticated and streams whatever the server has, or answers
 * 404 when it has none — so asking and handling the failure is the whole
 * protocol. The desktop client does the same before it has connected: with no
 * details to read an `icon_url` from, a bare `/icon` request is the only thing
 * to try.
 *
 * A rounded square rather than a circle, deliberately. A circle is a person
 * here — the voice tiles and the member list both use one — so a server being a
 * square is what keeps the two apart at a glance.
 *
 * There is no cache-busting `?v=` yet, because that reads `icon_url` off the
 * server details, and details arrive over the socket. Until then this is
 * whatever the URL cache holds. GRYT-407 carries the rest.
 */
export interface ServerIconProps {
  host: string;
  name: string;
  size?: number;
  /** Drawn around the icon when this is the server you are looking at. */
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ServerIcon({ host, name, size = 48, active, style }: ServerIconProps) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);

  const box: StyleProp<ViewStyle> = [
    {
      width: size,
      height: size,
      borderRadius: theme.radius.md,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      backgroundColor: theme.color.surfaceHover,
      borderWidth: active ? 2 : 0,
      borderColor: theme.color.text,
    },
    style,
  ];

  if (failed) {
    return (
      <View style={box}>
        <Text
          style={{
            color: theme.color.text,
            fontSize: Math.round(size / 3),
            fontWeight: "700",
          }}
        >
          {initialsFor(name)}
        </Text>
      </View>
    );
  }

  return (
    <View style={box}>
      <Image
        source={{ uri: `${getServerHttpBase(host)}/icon` }}
        style={{ width: size, height: size }}
        // A 404 is the ordinary answer for a server with no icon, not an
        // exception worth reporting.
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}
