import { useEffect, useRef, useState } from "react";
import { mediaDevices, type MediaStream } from "react-native-webrtc";
import type { Socket } from "socket.io-client";

/**
 * What the engine needs from `useSFU()` to carry a camera. The track and stream
 * types are the DOM's in the engine's public shape and `react-native-webrtc`'s
 * at runtime, and the two do not line up structurally.
 *
 * **`never` for the parameters**, so anything the engine exposes satisfies this
 * and the cast lives at one call site rather than spread over the file.
 */
interface VideoSink {
  isConnected: boolean;
  addVideoTrack: (track: never, stream: never) => void;
  removeVideoTrack: () => void;
}

/**
 * The phone's camera, into the call. **Three things in order and all three
 * matter:**
 *
 * 1. Open the camera with `react-native-webrtc`'s `getUserMedia`.
 * 2. Give the track to the engine, which publishes it to the SFU.
 * 3. Tell the server with `voice:camera:state`. **Without this the video is
 *    genuinely being sent and nobody draws it** — every client works out whose
 *    video a stream is from `cameraStreamID`, which only this event sets.
 *
 * The stream is kept so the local tile draws a self view from the camera rather
 * than a round trip.
 */
export function useCamera(sfu: VideoSink, socket: Socket | null, wanted: boolean) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /* The live stream, for the cleanup — which must not depend on the state
   * having re-rendered before it runs. */
  const open = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      const current = open.current;
      open.current = null;
      if (!current) return;
      sfu.removeVideoTrack();
      /* Stopping the track is what turns the light off. Dropping the reference
       * is not enough — the camera stays open until something says so. */
      for (const track of current.getTracks()) track.stop();
      socket?.emit("voice:camera:state", { enabled: false, streamId: "" });
    };

    if (!wanted || !sfu.isConnected) {
      stop();
      if (!cancelled) setStream(null);
      return;
    }

    void (async () => {
      try {
        const next = (await mediaDevices.getUserMedia({
          /* The front one, which is what a self view means. 720p and 30 are the
           * numbers `voiceConfigFrom` already declares for the camera block —
           * they were constants describing an intent nothing acted on, and this
           * is the thing that finally does. */
          video: {
            facingMode: "user",
            width: 1280,
            height: 720,
            frameRate: 30,
          },
        })) as MediaStream;

        if (cancelled) {
          for (const track of next.getTracks()) track.stop();
          return;
        }

        const track = next.getVideoTracks()[0];
        if (!track) throw new Error("The camera opened without a video track.");

        open.current = next;
        setStream(next);
        setProblem(null);
        sfu.addVideoTrack(track as never, next as never);
        socket?.emit("voice:camera:state", { enabled: true, streamId: next.id });
      } catch (error) {
        if (cancelled) return;
        /* A refusal is the ordinary case here — the permission prompt is the
         * first thing that happens — and it is not a failure to log and forget.
         * The sheet says so and the button goes back off. */
        setProblem(
          error instanceof Error && /permission|denied/i.test(error.message)
            ? "Camera access is off for Gryt. Turn it on in Settings."
            : "The camera did not start.",
        );
        setStream(null);
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, sfu.isConnected, socket]);

  return { stream, problem };
}
