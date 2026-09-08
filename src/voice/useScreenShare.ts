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
 * What the engine needs from `useSFU()` to carry a screen. **A separate sender from
 * the camera's**, since a face and a screen arrive as two streams.
 */
interface ScreenSink {
  isConnected: boolean;
  addScreenVideoTrack: (track: never, stream: never) => void;
  removeScreenVideoTrack: () => void;
}

/**
 * How long to wait for a broadcast that may never start. The system sheet has a
 * three second countdown and reading it first can take another ten.
 */
const WAIT_MS = 30_000;

export interface ScreenShare {
  /** Why it did not work, in a sentence somebody can act on. */
  problem: string | null;
  /**
   * Between the tap and the first frame. On iOS this is most of the interaction, and
   * the button needs to say something or the tap reads as ignored.
   */
  waiting: boolean;
}

/**
 * The phone's screen, into the call. **iOS cannot read the screen at all**, so
 * `getDisplayMedia()` resolves with a silent track and **it waits for `isCaptured`**.
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
   * something never announced would clear somebody else's flag. */
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
      /* `videoStreamId`, not `streamId` — the server's own name for the field. The
       * camera event spells it differently, which is a trap worth naming. */
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

        /* Ending a share from outside Gryt arrives here as the track ending. `onended`
         * because that is what `react-native-webrtc` puts on its own track. */
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

        if (!(await presentBroadcastPicker())) {
          throw new Error("iOS would not open the screen sharing sheet.");
        }

        /* Two awaits have happened since the last check, and leaving the call in
         * between is ordinary. Without this the code below re-arms a dead share. */
        if (cancelled) return;

        /**
         * **Watch first, then look.** The subscription is how a share ends as well
         * as how it starts, since stopping happens in the status bar.
         */
        unwatch = onScreenCaptureChange((captured) => {
          if (cancelled) return;
          if (captured) {
            announce(next);
            return;
          }
          /* Stopped from the status bar. The track's own `ended` usually follows,
             but not always promptly. */
          if (announced.current) ended.current();
        });

        /* Already capturing — AirPlay, or a broadcast started before the tap. Awaited
         * because the answer comes off the main thread. */
        if (await screenIsCaptured()) {
          announce(next);
        } else {
          timer = setTimeout(() => {
            if (cancelled || announced.current) return;
            setProblem("The screen share did not start.");
            ended.current();
          }, WAIT_MS);
        }
      } catch (error) {
        if (cancelled) return;
        /* A refusal is the ordinary case on Android, where the consent dialog is the
         * first thing that happens. */
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
