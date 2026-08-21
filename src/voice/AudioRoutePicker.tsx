import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "@gryt/ui-native";
import { AirplayIcon } from "phosphor-react-native/src/icons/Airplay";
import { BluetoothIcon } from "phosphor-react-native/src/icons/Bluetooth";
import { CarIcon } from "phosphor-react-native/src/icons/Car";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { DeviceMobileIcon } from "phosphor-react-native/src/icons/DeviceMobile";
import { DevicesIcon } from "phosphor-react-native/src/icons/Devices";
import { HeadphonesIcon } from "phosphor-react-native/src/icons/Headphones";
import { SpeakerHighIcon } from "phosphor-react-native/src/icons/SpeakerHigh";

import type { AudioRouteKind } from "../../modules/audio-route";
import type { AudioRouteState } from "./useAudioRoute";

/**
 * One icon per kind of thing a call can come out of.
 *
 * Exported because the button that opens the picker wears the current route's
 * icon, and a speaker button that shows a loudspeaker while the call is in your
 * AirPods is telling you something untrue about your own phone.
 */
export function routeIcon(kind: AudioRouteKind | undefined, size: number, color: string): ReactNode {
  switch (kind) {
    case "receiver":
      return <DeviceMobileIcon size={size} weight="regular" color={color} />;
    case "headphones":
      return <HeadphonesIcon size={size} weight="regular" color={color} />;
    case "bluetooth":
      return <BluetoothIcon size={size} weight="regular" color={color} />;
    case "car":
      return <CarIcon size={size} weight="regular" color={color} />;
    case "airplay":
      return <AirplayIcon size={size} weight="regular" color={color} />;
    case "speaker":
      return <SpeakerHighIcon size={size} weight="fill" color={color} />;
    default:
      /* Including "no route yet": before the session is up there is nothing to
         name, and a loudspeaker would be a guess. */
      return <DevicesIcon size={size} weight="regular" color={color} />;
  }
}

/**
 * The list of places the call could come out, over the tiles.
 *
 * A panel inside the voice sheet rather than a sheet of its own. `Sheet` renders
 * through `@gorhom/portal`, and a second one presented from inside the first has
 * to be dismissed before it is presented or it never appears at all — a trap
 * this package has already been caught by twice. A panel is also the shorter
 * gesture: one tap to open, one to pick, and the call never leaves the screen.
 *
 * Not the system's `AVRoutePickerView`, which would be the other honest answer.
 * That is the AirPlay button, and it presents Apple's own sheet in Apple's own
 * chrome over a dark app — worth revisiting, but it is a different design
 * decision rather than a smaller version of this one.
 */
export function AudioRoutePicker({
  state,
  onClose,
}: {
  state: AudioRouteState;
  onClose: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        marginHorizontal: theme.space(4),
        marginBottom: theme.space(2),
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: theme.color.surfaceRaised,
        overflow: "hidden",
      }}
    >
      {state.problem ? (
        <Text
          style={{
            color: theme.color.danger,
            fontSize: 13,
            paddingHorizontal: theme.space(4),
            paddingVertical: theme.space(3),
          }}
        >
          {state.problem}
        </Text>
      ) : null}

      {state.options.length === 0 ? (
        <Text
          style={{
            color: theme.color.muted,
            fontSize: 14,
            paddingHorizontal: theme.space(4),
            paddingVertical: theme.space(3),
          }}
        >
          {state.available
            ? "Nothing to choose from yet."
            : "This build cannot change the output."}
        </Text>
      ) : null}

      {state.options.map((option, i) => {
        const on = option.id === state.current?.id;
        return (
          <Pressable
            key={option.id}
            /* Stays open when it did not work, because the reason is printed
               at the top of this panel and closing would take it away. */
            onPress={() => {
              if (state.select(option.id)) onClose();
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={option.name}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: theme.space(3),
              paddingHorizontal: theme.space(4),
              paddingVertical: theme.space(3),
              backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
              borderTopWidth: i === 0 ? 0 : 1,
              borderColor: theme.color.border,
            })}
          >
            {routeIcon(option.kind, 20, on ? theme.color.accent : theme.color.text)}
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                color: on ? theme.color.accent : theme.color.text,
                fontSize: 16,
                fontWeight: on ? "600" : "400",
              }}
            >
              {option.name}
            </Text>
            {on ? <CheckIcon size={18} weight="bold" color={theme.color.accent} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
