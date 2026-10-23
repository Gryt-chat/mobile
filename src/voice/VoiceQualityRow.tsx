import { View } from "react-native";
import { Slider, Text, useTheme } from "@gryt/ui-native";

import { setVoiceQuality, useVoiceQuality, VOICE_QUALITY } from "./voiceQuality";

/** The desktop's voice quality slider (GRYT-1823), for the native engine. */
export function VoiceQualityRow() {
  const theme = useTheme();
  const kbps = useVoiceQuality();

  return (
    <View style={{ gap: theme.space(2), paddingVertical: theme.space(3) }}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: theme.color.text, fontSize: 16, fontWeight: "500" }}>Voice quality: {kbps} kbps</Text>
        <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 18 }}>
          How much data your voice uses in a call. At 192 it sounds the same as your microphone. Turn it down on phone data or weak Wi-Fi; 96 is the lowest that still sounds good.
        </Text>
      </View>
      <Slider
        min={VOICE_QUALITY.min}
        max={VOICE_QUALITY.max}
        step={VOICE_QUALITY.step}
        value={kbps}
        onValueChange={setVoiceQuality}
        accessibilityLabel="Voice quality"
      />
    </View>
  );
}
