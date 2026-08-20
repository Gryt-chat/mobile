import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Sheet, useTheme } from "@gryt/ui-native";

import { VoiceControls, VoiceView, type Participant } from "./VoiceView";

/** Fake, so there is something to look at before any of it is wired. */
const PEOPLE: Participant[] = [
  { id: "ingy", name: "Ingy Rasmussen", color: "#5a4b7c", speaking: true },
  { id: "me", name: "Sivert", color: "#3f5d52", hasVideo: true },
  { id: "arne", name: "Arne", color: "#7c5a4b", muted: true },
  { id: "simen", name: "Simen", color: "#4b5a7c" },
];

export function VoiceSheetDemo() {
  const theme = useTheme();
  const [count, setCount] = useState(2);
  const [state, setState] = useState({
    muted: false,
    deafened: false,
    camera: false,
    screen: false,
  });

  const participants = PEOPLE.slice(0, count);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg, padding: 24, paddingTop: 70, gap: 14 }}>
      <Text style={{ color: theme.color.text, fontSize: 20, fontWeight: "700" }}>
        Voice view mockup
      </Text>
      <Text style={{ color: theme.color.muted, fontSize: 13 }}>
        Fake participants. Two people is hero plus picture-in-picture; three and
        four go through the Meet optimiser, which fills rather than holding an
        aspect ratio.
      </Text>

      <View style={{ flexDirection: "row", gap: 8 }}>
        {[1, 2, 3, 4].map((n) => (
          <Pressable
            key={n}
            onPress={() => setCount(n)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: count === n ? theme.color.accent : theme.color.surfaceRaised,
            }}
          >
            <Text style={{ color: count === n ? theme.color.onAccent : theme.color.text, fontWeight: "600" }}>
              {n}
            </Text>
          </Pressable>
        ))}
      </View>

      <Sheet snapPoints={["70%", "92%"]}>
        <Sheet.Trigger
          style={{
            backgroundColor: theme.color.accent,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 999,
            alignSelf: "flex-start",
          }}
        >
          <Text style={{ color: theme.color.onAccent, fontWeight: "600" }}>
            Open voice view
          </Text>
        </Sheet.Trigger>
        <Sheet.Content style={{ padding: 0 }}>
          {/* minHeight as well as flex: BottomSheetView does not hand a
              definite height down, so a lone flex: 1 child collapses to zero
              and the grid gets a 0x0 box to lay out in. */}
          <View style={{ flex: 1, minHeight: 420 }}>
            <VoiceView participants={participants} selfId="me" />
          </View>
          <VoiceControls
            muted={state.muted}
            deafened={state.deafened}
            camera={state.camera}
            screen={state.screen}
            onToggle={(k) => setState((s) => ({ ...s, [k]: !s[k] }))}
            onLeave={() => {}}
          />
        </Sheet.Content>
      </Sheet>
    </View>
  );
}
