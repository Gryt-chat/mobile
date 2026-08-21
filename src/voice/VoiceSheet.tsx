import { useEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions, Text, View } from "react-native";
import { Sheet, useTheme } from "@gryt/ui-native";
import { SFUConnectionState, useSFU } from "@gryt/voice/native";

import { useShell } from "../shell/ShellContext";
import { VoiceControls, VoiceView, type Participant } from "./VoiceView";

/** Height of the control row, so the grid can be given the rest. */
const CONTROLS_HEIGHT = 76;
/** The sheet's resting snap point. */
const MIDDLE = 0.55;

/**
 * What each connection state says out loud.
 *
 * `CONNECTED` says nothing: once you are in a call the tiles are the status, and
 * a banner reading "Connected" over the top of them is noise.
 */
const SAYS: Partial<Record<SFUConnectionState, string>> = {
  [SFUConnectionState.REQUESTING_ACCESS]: "Asking the server…",
  [SFUConnectionState.CONNECTING]: "Connecting…",
  [SFUConnectionState.RECONNECTING]: "Reconnecting…",
  [SFUConnectionState.DISCONNECTED]: "Not connected",
};

/**
 * The voice view, in a sheet, opened by joining a voice channel.
 *
 * Until now this rendered four hardcoded people and was never mounted by
 * anything. It is now the engine's: `useSFU` connects when a channel is picked
 * and disconnects when the sheet closes.
 *
 * Driven by `voiceChannel` on the shell rather than by a `Sheet.Trigger`,
 * because the thing that opens it is a row in the channel list and the sheet is
 * anchored beside the tabs so it can cover the bar.
 */
export function VoiceSheet() {
  const window = useWindowDimensions();
  const theme = useTheme();
  const { voiceChannel, setVoiceChannel, voice, toggleVoice } = useShell();
  const sfu = useSFU();

  /* Which channel the engine was last asked about, so this effect does not
   * re-issue `connect` on every render — `sfu` is a new object each time. */
  const asked = useRef<string | null>(null);

  /**
   * Why the join failed, when `connect` rejects rather than reporting through
   * `connectionState`.
   *
   * `connect` **rejects**, and the first version of this called it as
   * `void sfu.connect(id)`. On a simulator that produced a red LogBox reading
   * "Uncaught (in promise) Error: Microphone…" over the top of the app, because
   * a device with no microphone is the ordinary case there and an unhandled
   * rejection is not.
   *
   * It is not an alternative to `connectionState` — the engine also moves to
   * RECONNECTING and keeps retrying — so this is the reason shown while that is
   * happening, rather than a second source of truth about whether you are in.
   */
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const id = voiceChannel?.id ?? null;
    if (asked.current === id) return;
    asked.current = id;
    setFailure(null);

    const complain = (error: unknown) => {
      setFailure(error instanceof Error ? error.message : String(error));
    };

    if (id) sfu.connect(id).catch(complain);
    else sfu.disconnect().catch(complain);
    /* Deliberately not depending on `sfu`. Its identity changes every render and
     * the guard above is what makes this idempotent. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceChannel?.id]);

  /**
   * A tile per remote stream, and one for you.
   *
   * No names, and that is the engine's shape rather than an omission here:
   * `SFUInterface.streams` is keyed by stream id and carries `isLocal` and
   * nothing else — no user id, no nickname. The socket does not send a member
   * list either. So a tile can say "someone is here" and not who, until
   * membership arrives. GRYT-452 records that boundary.
   */
  const participants = useMemo<Participant[]>(() => {
    const entries = Object.entries(sfu.streams);
    const remote = entries.filter(([, s]) => !s.isLocal);

    return [
      { id: "me", name: "You", color: theme.color.surfaceRaised, muted: voice.muted },
      ...remote.map(([id], i) => ({
        id,
        name: `Someone (${i + 1})`,
        color: theme.color.surfaceRaised,
      })),
    ];
  }, [sfu.streams, voice.muted, theme.color.surfaceRaised]);

  const status = SAYS[sfu.connectionState];
  const failed = sfu.connectionState === SFUConnectionState.FAILED;

  /* `connectionError` distinguishes a dropped call from an ordinary hang-up, and
   * the engine goes out of its way to say so. Prefer it over `error`. */
  const problem =
    failure ?? (failed ? (sfu.connectionError ?? sfu.error ?? "Could not connect") : null);

  return (
    <Sheet
      snapPoints={["55%", "100%"]}
      open={voiceChannel !== null}
      onOpenChange={(open) => {
        if (!open) setVoiceChannel(null);
      }}
    >
      <Sheet.Content style={{ padding: 0 }}>
        {(status || problem) && (
          <View
            style={{
              paddingHorizontal: theme.space(4),
              paddingVertical: theme.space(2),
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: problem ? theme.color.danger : theme.color.muted,
                fontSize: 14,
                fontWeight: "600",
                textAlign: "center",
              }}
            >
              {problem ?? status}
            </Text>
          </View>
        )}

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
          <VoiceView participants={participants} selfId="me" />
        </View>
        <VoiceControls
          muted={voice.muted}
          deafened={voice.deafened}
          camera={voice.camera}
          screen={voice.screen}
          /* Straight onto the shell, which is what `VoiceProvider` builds the
           * engine's config from — so muting here is muting in the engine
           * rather than a second piece of state that has to be kept in step. */
          onToggle={toggleVoice}
          onLeave={() => setVoiceChannel(null)}
        />
      </Sheet.Content>
    </Sheet>
  );
}
