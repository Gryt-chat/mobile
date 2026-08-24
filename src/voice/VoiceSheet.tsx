import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Sheet, Text, useTheme } from "@gryt/ui-native";
import { SFUConnectionState, useSFU } from "@gryt/voice/native";

import { useServerConnection } from "../connection/ConnectionsProvider";
import { useShell } from "../shell/ShellContext";
import { useMe } from "../shell/useMe";
import { AudioRoutePicker } from "./AudioRoutePicker";
import { useAudioRoute } from "./useAudioRoute";
import { useMembers } from "../connection/MembersProvider";
import { useProfileState } from "../profile/ProfileProvider";
import { VoiceControls, VoiceView, type Participant } from "./VoiceView";
import { camerasFrom, sharesFrom, videoStreamIds } from "./shares";
import { useCamera } from "./useCamera";
import { useScreenShare } from "./useScreenShare";
import { useServerClients } from "./useServerClients";
import { useBackToClose } from "../ui/useBackToClose";
import { useAppearance } from "../preferences/appearance";
import { playSound } from "../notify/sounds";


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
  const {
    voiceChannel,
    setVoiceChannel,
    voiceOpen,
    setVoiceOpen,
    voice,
    toggleVoice,
    setVoice,
  } = useShell();
  const sfu = useSFU();
  /* Your own tile wears your own face, which means your own name — the same one
   * the bar's avatar is seeded on. It used to say "You", which is a label and
   * not a name: everybody's face came out identical. */
  const me = useMe(voiceChannel !== null).name;
  /* Read here, in the ordinary tree. `Sheet.Content` renders through
   * `@gorhom/portal`, so nothing below it can reach a provider — the whole
   * reason every value this sheet needs is gathered in its body. */
  const members = useMembers();
  const profile = useProfileState();
  const { sounds: soundsOn } = useAppearance();
  /* The socket for `server:clients`, and who this device is, so my own share is
   * not drawn back at me. */
  const { socket, me: session } = useServerConnection();

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
   * The engine gives streams and no identity — `SFUInterface.streams` is keyed
   * by stream id and carries `isLocal` and nothing else. What closes that gap
   * is the member list, which carries each member's `streamID`: the mapping
   * back from a stream to a person, sent by a server that has always sent it.
   * GRYT-452 recorded the boundary and GRYT-503 crossed it.
   *
   * A stream with no member is still drawn, unnamed. That is not an error case
   * to hide — somebody has just joined and the list has not caught up — and a
   * tile that appears a moment before its name is much better than a person who
   * is audible and absent.
   */
  const clients = useServerClients(socket);

  /* The camera, when it is wanted and the engine is up. `stream` is the local
   * track, drawn straight into your own tile — a self view is the camera rather
   * than a round trip through the SFU. */
  const camera = useCamera(sfu, socket, voice.camera && voiceChannel !== null);

  /* The screen, the same way — except that this one can also end without Gryt
   * being asked. Somebody stops the broadcast from the iOS status bar or the
   * Android notification, and the button has to follow, which is what the
   * callback is for. */
  const screen = useScreenShare(
    sfu,
    socket,
    voice.screen && voiceChannel !== null,
    useCallback(() => setVoice({ screen: false }), [setVoice]),
  );

  const participants = useMemo<Participant[]>(() => {
    const cameras = camerasFrom(clients, voiceChannel?.id ?? null);
    /* Ids that are video rather than a person. See `videoStreamIds` — a camera
     * or a screen landing in `streams` becomes a tile with no member behind it,
     * which is the anonymous face that appears when somebody turns a webcam
     * off and the engine renegotiates. GRYT-583. */
    const video = videoStreamIds(clients, voiceChannel?.id ?? null);

    const remote = Object.entries(sfu.streams).filter(([id, s]) => {
      if (s.isLocal) return false;
      /* Two guards for one mistake, because they fail in different
       * circumstances. `kind` is what the engine says the stream is, and is
       * absent on older ones; the id set is what the *server* says, and is
       * empty for the moment between a track arriving and `server:clients`
       * catching up. */
      if (s.kind === "video") return false;
      if (video.has(id)) return false;
      return true;
    });

    return [
      {
        id: "me",
        name: me,
        avatarUrl: profile.avatarUrl,
        muted: voice.muted,
        deafened: voice.deafened,
        /* Local, and mirrored where it is drawn: a self view that is not
         * mirrored reads as somebody else's video of you. */
        streamURL: camera.stream?.toURL() ?? null,
        mirrored: true,
        fit: "face" as const,
      },
      ...remote.map(([id]) => {
        const member = members.byStreamId.get(id);
        /* Their camera is a *different* stream from the audio one this tile is
         * keyed on, so it is looked up by who they are rather than by stream
         * id. `server:clients` is the only place that mapping exists. */
        const cameraStreamId = member?.serverUserId ? cameras.get(member.serverUserId) : undefined;
        const cameraStream = cameraStreamId
          ? (sfu.videoStreams[cameraStreamId] as { toURL?: () => string } | undefined)
          : undefined;
        return {
          id,
          streamURL: cameraStream?.toURL?.() ?? null,
          fit: "face" as const,
          /* Still null rather than "Someone" when nobody knows. The tile draws
           * a face seeded on the stream id, so two unnamed people are two
           * people rather than one. */
          name: member?.nickname ?? null,
          avatarUrl: members.avatarUrlFor(member),
          /* The server's view of their microphone, which is the only one there
           * is — the engine reports nothing about a remote track's mute. */
          muted: member?.isMuted,
          /* Already on the wire — the server has sent `isDeafened` on the
           * member list all along and nothing drew it. */
          deafened: member?.isDeafened,
        };
      }),
    ];
  }, [
    sfu.streams,
    sfu.videoStreams,
    voice.muted,
    me,
    members,
    profile.avatarUrl,
    camera.stream,
    clients,
    voiceChannel?.id,
  ]);

  /**
   * Somebody else's screen, when there is one.
   *
   * Two halves that only meet here. The **server** says who is sharing and
   * which stream carries it, on `server:clients` — the one event with
   * `screenShareEnabled` on it, and the reason `useServerClients` exists. The
   * **engine** has the picture, in `videoStreams`, keyed by that same stream id.
   *
   * A share the engine has not received yet is dropped rather than drawn as an
   * empty tile: the server knows about it a moment before the track arrives,
   * and half a second of a black rectangle with a name on it looks like a
   * failure rather than like loading.
   */
  const shares = useMemo<Participant[]>(() => {
    const drawn: Participant[] = [];
    for (const share of sharesFrom(clients, voiceChannel?.id ?? null, session?.serverUserId ?? null)) {
      const stream = sfu.videoStreams[share.streamId] as { toURL?: () => string } | undefined;
      /* `MediaStream` is the DOM type in the engine's public shape; the object
       * at runtime is `react-native-webrtc`'s, which has `toURL`. The cast is
       * the same one `platform/native.ts` makes for the peer connection, and
       * for the same reason: two implementations of one interface that the
       * structural types do not line up. */
      const url = stream?.toURL?.();
      if (!url) continue;
      drawn.push({
        id: `share:${share.streamId}`,
        name: share.nickname ? `${share.nickname}'s screen` : "A screen",
        streamURL: url,
        fit: "screen",
      });
    }
    return drawn;
  }, [clients, voiceChannel?.id, session?.serverUserId, sfu.videoStreams]);

  /* Back minimises the call, matching what a dismiss does — it does not hang
   * up. Leaving is the Leave button, which is a different gesture for a
   * different thing. */
  useBackToClose(voiceOpen && voiceChannel !== null, () => setVoiceOpen(false));

  /**
   * Somebody joining or leaving the call you are in.
   *
   * Counted off the engine's remote streams rather than off `server:clients`,
   * because the stream is the thing you can actually hear: a client that has
   * said it joined but has not published yet is not somebody who has arrived
   * in the room, and chiming for them would be a sound with nobody behind it.
   *
   * The first count after connecting is skipped. Joining a call with three
   * people in it should not play three arrival sounds — they were already
   * there, and the thing being announced is a change.
   */
  const remoteCount = useMemo(
    () => Object.values(sfu.streams).filter((stream) => !stream.isLocal).length,
    [sfu.streams],
  );
  const previousCount = useRef<number | null>(null);

  useEffect(() => {
    if (!voiceChannel) {
      previousCount.current = null;
      return;
    }
    const before = previousCount.current;
    previousCount.current = remoteCount;
    if (before === null || before === remoteCount) return;
    if (!soundsOn) return;
    /* Always in a call — these are somebody joining or leaving the one you are
     * in — so the audio mode is never touched here. */
    playSound(remoteCount > before ? "connect" : "disconnect", { inCall: true });
  }, [remoteCount, voiceChannel, soundsOn]);

  /**
   * And one for your own arrival and departure.
   *
   * The effect above counts *other people*, so joining an empty channel was
   * silent and leaving was silent, which reads as the button not having worked
   * — the one moment you most want to hear that something happened.
   *
   * Separate from the count effect rather than folded into it. That one is
   * about the room changing around you and has to ignore the first reading;
   * this one is about you, fires once each way, and has no baseline to
   * establish.
   */
  const wasInCall = useRef(false);
  useEffect(() => {
    const inCall = voiceChannel !== null;
    if (inCall === wasInCall.current) return;
    wasInCall.current = inCall;
    if (!soundsOn) return;
    /* `inCall: true` on the way out as well. The call is ending and the audio
     * session is still WebRTC's for a moment longer; reconfiguring it on the
     * way past is the bug GRYT-578 was. */
    playSound(inCall ? "connect" : "disconnect", { inCall: true });
  }, [voiceChannel, soundsOn]);

  const status = SAYS[sfu.connectionState];
  const failed = sfu.connectionState === SFUConnectionState.FAILED;

  /* `connectionError` distinguishes a dropped call from an ordinary hang-up, and
   * the engine goes out of its way to say so. Prefer it over `error`.
   *
   * The camera's and the screen's reasons share this line, under the connection's
   * — a call that is not connected explains that first, and a refused camera
   * during a working call is the next most useful thing to know. `useCamera` has
   * returned a `problem` since GRYT-535 and nothing read it, so denying camera
   * access made the button go back off and say nothing at all. */
  const problem =
    failure ??
    (failed ? (sfu.connectionError ?? sfu.error ?? "Could not connect") : null) ??
    screen.problem ??
    camera.problem;

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
        The horizontal and top padding go, because the tiles run to the edges.
        **The bottom padding stays**, and it is the component's — `space(4)`
        plus the home indicator's inset — which is what keeps the control row
        off the bottom edge. `padding: 0` used to wipe all four.

        `height: "100%"` used to be here too, because `BottomSheetView` sizes
        itself to its content and a `flex: 1` child inside it has nothing to be
        one-of — the tiles collapsed to nothing. It is `Sheet.Content`'s own
        default as of `@gryt/ui-native` 0.11.0, which is what three of three
        callers passing it was telling us. GRYT-516.
      */}
      <Sheet.Content style={{ paddingHorizontal: 0, paddingTop: 0 }}>
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
          <VoiceView participants={participants} selfId="me" shares={shares} />

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
          screenWaiting={screen.waiting}
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
