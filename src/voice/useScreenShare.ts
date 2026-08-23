import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { mediaDevices, type MediaStream } from "react-native-webrtc";
import type { Socket } from "socket.io-client";

import {
  broadcastPickerAvailable,
  onScreenCaptureChange,
  presentBroadcastPicker,
  screenIsCaptured,
} from "../../modules/broadcast-picker";

/**
 * What the engine needs from `useSFU()` to carry a screen.
 *
 * The same shape and the same `never` parameters as `VideoSink` in
 * `useCamera.ts`, for the same reason: the engine's public types are the DOM's
 * and the runtime's are `react-native-webrtc`'s, and the cast belongs at one
 * call site rather than spread across the file.
 *
 * A separate sender from the camera's, which is why these are separate methods
 * on the engine rather than one. Somebody can show their face and their screen
 * at the same time and the two arrive as two streams.
 */
interface ScreenSink {
  isConnected: boolean;
  addScreenVideoTrack: (track: never, stream: never) => void;
  removeScreenVideoTrack: () => void;
}

/**
 * How long to wait for a broadcast that may never start.
 *
 * The system sheet has a three second countdown and somebody reading it first
 * can easily take another ten. Thirty is long enough not to cut anybody off and
 * short enough that a cancelled share does not sit there pretending.
 */
const WAIT_MS = 30_000;

export interface ScreenShare {
  /** Why it did not work, in a sentence somebody can act on. */
  problem: string | null;
  /**
   * Between the tap and the first frame.
   *
   * On iOS this is most of the interaction — the sheet, the countdown — and the
   * button needs to say something during it, or the tap reads as ignored.
   */
  waiting: boolean;
}

/**
 * The phone's screen, into the call.
 *
 * The two platforms are genuinely different here and the difference is visible
 * in this file rather than hidden behind a helper, because pretending they are
 * the same is what makes this kind of code wrong.
 *
 * **Android** is ordinary. `getDisplayMedia()` shows the system's consent
 * dialog, resolves when it is accepted, rejects when it is not, and the frames
 * come from `MediaProjection` inside this process. Three steps, exactly like
 * `useCamera`: capture, hand to the engine, tell the server.
 *
 * **iOS** cannot read the screen at all. Only ReplayKit can, from a separate
 * process, and the frames come back through a socket in a shared container —
 * see `targets/broadcast/`. That splits the three steps in two:
 *
 * 1. `getDisplayMedia()` resolves *immediately* and captures nothing. All it
 *    does is start the app listening on that socket. There is a track, and it
 *    is silent.
 * 2. The person has to start the broadcast themselves, from a system sheet
 *    Gryt is not allowed to draw. `presentBroadcastPicker` opens it.
 *
 * So the announcement waits for `UIScreen.isCaptured`. Announcing at the tap
 * would put a black rectangle with somebody's name under it on everyone else's
 * screen for the length of the sheet, the countdown and any hesitation — and
 * leave it there permanently if they cancelled.
 *
 * The same signal ends it: stopping a broadcast happens in the status bar,
 * nowhere near Gryt, so `onScreenCaptureChange` going false is how this finds
 * out. `onEnded` exists to push that back into the button, which otherwise
 * stays lit over a share that stopped.
 */
export function useScreenShare(
  sfu: ScreenSink,
  socket: Socket | null,
  wanted: boolean,
  onEnded: () => void,
): ScreenShare {
  const [problem, setProblem] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  /* The live stream, for the cleanup — which must not depend on the state
   * having re-rendered before it runs. */
  const open = useRef<MediaStream | null>(null);
  /* Whether the room has been told. Announcing twice is harmless; *unannouncing*
   * something never announced is what this actually guards, since that would
   * clear a flag somebody else's share had set. */
  const announced = useRef(false);
  /* Kept out of the effect's closure so the capture listener, which outlives a
   * render, calls the current one. */
  const ended = useRef(onEnded);
  ended.current = onEnded;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unwatch: (() => void) | null = null;

    const announce = (stream: MediaStream) => {
      if (announced.current) return;
      announced.current = true;
      setWaiting(false);
      /* `videoStreamId`, not `streamId` — the server's own name for the field,
       * and the one `screenShareVideoStreamID` on `server:clients` is built
       * from. The camera event spells it differently, which is a trap worth
       * naming rather than tidying up from here. */
      socket?.emit("voice:screen:state", { enabled: true, videoStreamId: stream.id });
    };

    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      unwatch?.();
      unwatch = null;

      const current = open.current;
      open.current = null;
      setWaiting(false);
      if (!current) return;

      sfu.removeScreenVideoTrack();
      /* On iOS this is also what ends the broadcast: the extension is watching
       * its end of the socket and finishes when this side closes. */
      for (const track of current.getTracks()) track.stop();

      if (announced.current) {
        announced.current = false;
        socket?.emit("voice:screen:state", { enabled: false, videoStreamId: "" });
      }
    };

    if (!wanted || !sfu.isConnected) {
      stop();
      return;
    }

    void (async () => {
      try {
        if (Platform.OS === "ios" && !broadcastPickerAvailable) {
          throw new Error(
            "This build of Gryt cannot share your screen. It needs a newer one.",
          );
        }

        setProblem(null);
        setWaiting(true);

        const next = (await mediaDevices.getDisplayMedia({})) as MediaStream;

        if (cancelled) {
          for (const track of next.getTracks()) track.stop();
          return;
        }

        const track = next.getVideoTracks()[0];
        if (!track) throw new Error("The screen capture started without a video track.");

        open.current = next;
        sfu.addScreenVideoTrack(track as never, next as never);

        /* Ending a share from outside Gryt — the status bar on iOS, the
         * notification on Android — arrives here as the track ending. Without
         * this the button stays lit over nothing. `onended` rather than
         * `addEventListener` because that is what `react-native-webrtc` puts on
         * its own `MediaStreamTrack` type. */
        track.onended = () => {
          if (cancelled) return;
          ended.current();
        };

        if (Platform.OS !== "ios") {
          /* Android already asked and was already answered. The consent dialog
           * is what `getDisplayMedia` awaited. */
          announce(next);
          return;
        }

        if (!presentBroadcastPicker()) {
          throw new Error("iOS would not open the screen sharing sheet.");
        }

        /* Already capturing — AirPlay, or a broadcast started before the tap.
         * Rare, and cheaper to handle than to reason about. */
        if (screenIsCaptured()) {
          announce(next);
        } else {
          unwatch = onScreenCaptureChange((captured) => {
            if (cancelled) return;
            if (captured) {
              announce(next);
              return;
            }
            /* Stopped from the status bar. The track's own `ended` usually
               follows, but not always promptly, and the room should not keep a
               frozen frame while it does. */
            if (announced.current) ended.current();
          });

          timer = setTimeout(() => {
            if (cancelled || announced.current) return;
            setProblem("The screen share did not start.");
            ended.current();
          }, WAIT_MS);
        }
      } catch (error) {
        if (cancelled) return;
        /* A refusal is the ordinary case on Android — the consent dialog is the
         * first thing that happens — and it is not a failure worth a scary
         * message. */
        const message =
          error instanceof Error && /permission|denied|abort/i.test(error.message)
            ? "Screen sharing was not allowed."
            : error instanceof Error
              ? error.message
              : "The screen share did not start.";
        setProblem(message);
        setWaiting(false);
        ended.current();
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, sfu.isConnected, socket]);

  return { problem, waiting };
}
