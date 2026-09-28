import { useRef } from "react";
import { Pressable, View } from "react-native";
import { Sheet, Slider, Switch, Text, useTheme } from "@gryt/ui-native";

import { useBackToClose } from "../ui/useBackToClose";
import {
  isLocallyMuted,
  resetUserVolume,
  setUserMuted,
  setUserVolume,
  useUserAudio,
  VOLUME_DEFAULT,
  VOLUME_MAX,
  VOLUME_MIN,
  VOLUME_STEP,
  volumeOf,
} from "./userVolumes";

export interface VolumeTarget {
  serverUserId: string;
  name: string | null;
}

/**
 * The desktop's volume slider from its right-click menu, in a sheet: 0 to 200 in steps of one,
 * and Reset volume once it has moved. Mute is the phone's addition, and only you hear it.
 */
export function UserVolumeSheet({
  target,
  onClose,
}: {
  target: VolumeTarget | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const audio = useUserAudio();
  /* The last one, so the name doesn't turn into "Someone" while the sheet slides away. */
  const last = useRef(target);
  if (target) last.current = target;
  const shown = target ?? last.current;
  const id = shown?.serverUserId ?? null;
  const volume = id ? volumeOf(audio, id) : VOLUME_DEFAULT;
  const muted = id ? isLocallyMuted(audio, id) : false;

  useBackToClose(target !== null, onClose);

  return (
    <Sheet
      snapPoints={["45%"]}
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Sheet.ScrollView>
        <View style={{ gap: theme.space(4) }}>
          <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 22, fontWeight: "700" }}>
            {shown?.name ?? "Someone"}
          </Text>

          <View style={{ gap: theme.space(2), opacity: muted ? 0.5 : 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: theme.color.muted, fontSize: 13 }}>Volume</Text>
              <Text style={{ color: theme.color.text, fontSize: 13, fontWeight: "500", fontVariant: ["tabular-nums"] }}>
                {volume}%
              </Text>
            </View>
            <Slider
              min={VOLUME_MIN}
              max={VOLUME_MAX}
              step={VOLUME_STEP}
              value={volume}
              onValueChange={(next) => id && setUserVolume(id, next)}
              accessibilityLabel={`Volume for ${shown?.name ?? "them"}`}
            />
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "500" }}>Mute</Text>
              <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 18 }}>
                Stops their audio on this phone. They aren't told.
              </Text>
            </View>
            <Switch checked={muted} onCheckedChange={(next) => id && setUserMuted(id, next)} />
          </View>

          {volume !== VOLUME_DEFAULT ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => id && resetUserVolume(id)}
              style={({ pressed }) => ({
                paddingVertical: theme.space(2.5),
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ color: theme.color.accent, fontSize: 15, fontWeight: "500" }}>Reset volume</Text>
            </Pressable>
          ) : null}
        </View>
      </Sheet.ScrollView>
    </Sheet>
  );
}
