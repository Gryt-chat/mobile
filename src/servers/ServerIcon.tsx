import { useState } from "react";
import { Image, View, type StyleProp, type ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";
import { useTheme } from "@gryt/ui-native";

import { getServerHttpBase } from "./address";
import { generatedServerIconSvg } from "../avatar/generatedAvatar";

/**
 * A server's icon, or a planet drawn from its name.
 *
 * `/icon` is unauthenticated and streams whatever the server has, or answers
 * 404 when it has none — so asking and handling the failure is the whole
 * protocol.
 *
 * A rounded square rather than a circle, deliberately. A circle is a person
 * here, so a server being a square is what keeps the two apart at a glance.
 *
 * The fallback is the same generated planet the desktop client draws, from the
 * same DiceBear style and the same seed. Initials were a poor identifier for
 * the same reason they are for people — half a server list is an S — and the
 * two clients disagreeing about what a server looks like is worse than either.
 *
 * There is no cache-busting `?v=` yet, because that reads `icon_url` off the
 * server details, and details arrive over the socket. GRYT-407 carries the rest.
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
    /* Seeded on the name rather than the host, matching the web. Renaming a
     * server redraws its planet, which is the behaviour people expect and is
     * also what lets an icon exist before the server answers. */
    return (
      <View style={box}>
        <SvgXml
          xml={generatedServerIconSvg(name)}
          width={size}
          height={size}
          accessibilityLabel={name}
        />
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
