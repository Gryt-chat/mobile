import { useState } from "react";
import { Image, View, type StyleProp, type ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";
import { useTheme } from "@gryt/ui-native";

import { getServerHttpBase } from "./address";
import { generatedServerIconSvg } from "../avatar/generatedAvatar";

/**
 * A server's icon, or a planet drawn from its name; `/icon` answers 404 when there is
 * none. A rounded square — a circle is a person here — and the desktop's same seed.
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
    /* Seeded on the name rather than the host, matching the web: renaming a server
     * redraws its planet, and an icon can exist before the server answers. */
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
