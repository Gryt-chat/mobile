import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Sheet, useTheme } from "@gryt/ui-native";
import { SFUConnectionState, useSFU } from "@gryt/voice/native";

import { useShell } from "../shell/ShellContext";
import { useMe } from "../shell/useMe";
import { AudioRoutePicker } from "./AudioRoutePicker";
import { useAudioRoute } from "./useAudioRoute";
import { VoiceControls, VoiceView, type Participant } from "./VoiceView";


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
  const theme = useTheme();
  const { voiceChannel, setVoiceChannel, voiceOpen, setVoiceOpen, voice, toggleVoice } =
    useShell();
  const sfu = useSFU();
  /* Your own tile wears your own face, which means your own name — the same one
   * the bar's avatar is seeded on. It used to say "You", which is a label and
   * not a name: everybody's face came out identical. */
  const me = useMe(voiceChannel !== null).name;

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

  /**
   * Where the call comes out.
   *
   * Read only while there is a channel: before one, `AVAudioSession` is not in
   * `playAndRecord`, so the list would be whatever the phone happened to be
   * doing and nothing on it could be picked.
   */
  const audio = useAudioRoute(voiceChannel !== null);
  const [routeOpen, setRouteOpen] = useState(false);

  /* Closing the sheet closes the picker with it. Leaving it open means the next
   * call opens with a panel nobody asked for, over a list from the last one. */
  useEffect(() => {
    if (voiceChannel === null) setRouteOpen(false);
  }, [voiceChannel]);

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
      { id: "me", name: me, muted: voice.muted },
      /* No name, rather than a made-up one. The tile says "Someone" and draws a
       * face seeded on the stream id, so two of them are two people. */
      ...remote.map(([id]) => ({ id, name: null })),
    ];
  }, [sfu.streams, voice.muted, me]);

  const status = SAYS[sfu.connectionState];
  const failed = sfu.connectionState === SFUConnectionState.FAILED;

  /* `connectionError` distinguishes a dropped call from an ordinary hang-up, and
   * the engine goes out of its way to say so. Prefer it over `error`. */
  const problem =
    failure ?? (failed ? (sfu.connectionError ?? sfu.error ?? "Could not connect") : null);

  return (
    <Sheet
      /* One height, and it is all of it. A call is the thing you are doing,
         not something to peek at over the top of what you were doing — and
         with two snap points the controls could end up below the sheet's own
         bottom edge, which is what they did. */
      snapPoints={["100%"]}
      open={voiceOpen && voiceChannel !== null}
      /* A dismiss minimises. The call keeps running and the bar's phone brings
       * it back; hanging up is the Leave button, which is a different gesture
       * for a different thing. */
      onOpenChange={(open) => {
        if (!open) setVoiceOpen(false);
      }}
    >
      {/*
        `height: "100%"` because `BottomSheetView` sizes itself to its content,
        so a `flex: 1` child inside it has nothing to be one-of and collapses to
        nothing — which is exactly what the tiles did. One snap point means the
        sheet has a definite height to be all of.

        The horizontal and top padding go, because the tiles run to the edges.
        **The bottom padding stays**, and it is the component's — `space(4)`
        plus the home indicator's inset — which is what keeps the control row
        off the bottom edge. `padding: 0` used to wipe all four.
      */}
      <Sheet.Content style={{ paddingHorizontal: 0, paddingTop: 0, height: "100%" }}>
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
          The tiles take whatever the controls do not.

          This used to be an explicit floor — the middle snap point's height
          minus the control row's — because with two snap points there was no
          single answer and `BottomSheetView` sizes to its content, so a lone
          `flex: 1` collapsed to nothing. The floor was a guess about the sum,
          and it was wrong in the direction that matters: content taller than
          the sheet, with the controls pushed off the bottom edge.

          One snap point means the sheet has one height, so the box can just
          have what is left. GRYT-401 was about tracking a drag between two
          heights and there is no drag to track any more.
        */}
        <View style={{ flex: 1 }}>
          <VoiceView participants={participants} selfId="me" />

          {/*
            Over the tiles rather than above them.

            In the flow it would be a third child of a box whose first one has a
            minimum height, so opening the picker would push the controls past
            the snap point and off the bottom of the sheet. Absolute keeps the
            sheet exactly the size it was.

            The backdrop is what makes a tap anywhere else close it, which is
            the first gesture anybody will try.
          */}
          {routeOpen ? (
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                justifyContent: "flex-end",
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close output picker"
                onPress={() => setRouteOpen(false)}
                style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
              />
              <AudioRoutePicker state={audio} onClose={() => setRouteOpen(false)} />
            </View>
          ) : null}
        </View>

        <VoiceControls
          route={audio.current}
          routeOpen={routeOpen}
          onRoute={() => setRouteOpen((open) => !open)}
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
