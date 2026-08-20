import { useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { Sheet, useTheme } from "@gryt/ui-native";

import { VoiceControls, VoiceView, type Participant } from "./VoiceView";

/** Fake, so there is something to look at before any of it is wired. */
const PEOPLE: Participant[] = [
  { id: "ingy", name: "Ingy Rasmussen", color: "#5a4b7c", speaking: true },
  { id: "me", name: "Sivert", color: "#3f5d52", hasVideo: true },
  { id: "arne", name: "Arne", color: "#7c5a4b", muted: true },
  { id: "simen", name: "Simen", color: "#4b5a7c" },
];

/** Height of the control row, so the grid can be given the rest. */
const CONTROLS_HEIGHT = 76;
/** The sheet's resting snap point. */
const MIDDLE = 0.55;

export function VoiceSheetDemo() {
  const theme = useTheme();
  const window = useWindowDimensions();
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

      <Sheet snapPoints={["55%", "100%"]}>
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
          {/*
            An explicit floor rather than a bare `flex: 1`.

            `BottomSheetView` lays its children out by content, so a lone
            `flex: 1` child has nothing to be one-of and collapses to zero —
            the grid rendered as nothing and only the controls showed. Giving
            the sheet's view `height: "100%"` instead swung it the other way
            and the grid ran off the bottom, past the controls.

            So the grid is told what it has at rest: the middle snap point
            minus the controls. It still measures itself with `onLayout`, so
            dragging to the taller snap point grows the tiles — this is the
            floor, not the ceiling.

            Worth replacing with something that reads the sheet's real animated
            height, which would track the drag continuously rather than in two
            steps. GRYT-401.
          */}
          <View style={{ flex: 1, minHeight: window.height * MIDDLE - CONTROLS_HEIGHT }}>
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
