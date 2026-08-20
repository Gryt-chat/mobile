import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { Sheet } from "@gryt/ui-native";

import { VoiceControls, VoiceView, type Participant } from "./VoiceView";

/* Fake, so there is something to look at before any of it is wired. */
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

export interface VoiceSheetProps {
  /** The voice channel you are in, or null. */
  channelId: string | null;
  onClose: () => void;
}

/**
 * The voice view, in a sheet, opened by joining a voice channel.
 *
 * The demo screen this came from is gone — it was the whole app before there
 * was a shell, and its participant-count buttons were a harness for the grid
 * rather than anything a person would use. The grid is covered by
 * `meetLayout.test.ts`; what is left here is the sheet.
 *
 * Driven by `open` rather than by a `Sheet.Trigger`, because the thing that
 * opens it is a row in the channel list and the sheet is anchored at the root.
 */
export function VoiceSheet({ channelId, onClose }: VoiceSheetProps) {
  const window = useWindowDimensions();
  const [state, setState] = useState({
    muted: false,
    deafened: false,
    camera: false,
    screen: false,
  });

  return (
    <Sheet
      snapPoints={["55%", "100%"]}
      open={channelId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Sheet.Content style={{ padding: 0 }}>
        {/*
          An explicit floor rather than a bare `flex: 1`.

          `BottomSheetView` lays its children out by content, so a lone
          `flex: 1` child has nothing to be one-of and collapses to zero — the
          grid rendered as nothing and only the controls showed. Giving the
          sheet's view `height: "100%"` instead swung it the other way and the
          grid ran off the bottom, past the controls.

          So the grid is told what it has at rest: the middle snap point minus
          the controls. It still measures itself with `onLayout`, so dragging
          to the taller snap point grows the tiles — this is the floor, not the
          ceiling.

          Worth replacing with something that reads the sheet's real animated
          height, which would track the drag continuously rather than in two
          steps. GRYT-401.
        */}
        <View style={{ flex: 1, minHeight: window.height * MIDDLE - CONTROLS_HEIGHT }}>
          <VoiceView participants={PEOPLE.slice(0, 3)} selfId="me" />
        </View>
        <VoiceControls
          muted={state.muted}
          deafened={state.deafened}
          camera={state.camera}
          screen={state.screen}
          onToggle={(k) => setState((s) => ({ ...s, [k]: !s[k] }))}
          onLeave={onClose}
        />
      </Sheet.Content>
    </Sheet>
  );
}
