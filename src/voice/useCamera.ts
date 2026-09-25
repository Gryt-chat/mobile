import { useEffect, useRef, useState } from "react";
import { senderStreamId } from "@gryt/core";
import type { VideoRole, VideoSendSettings } from "@gryt/voice/native";
import { mediaDevices, type MediaStream } from "react-native-webrtc";
import type { Socket } from "socket.io-client";

import { QUALITY_TOOLS, sourceOf } from "./qualityTools";
import { CAMERA_NATIVE_CAPTURE, cameraSend, type QualityPreset } from "./streamQuality";

export type Facing = "user" | "environment";

/**
 * What the engine needs from `useSFU()` to carry a camera. **`never` for the
 * parameters**, so the cast lives at one call site rather than across the file.
 */
interface VideoSink {
  isConnected: boolean;
  addVideoTrack: (track: never, stream: never) => void;
  removeVideoTrack: () => void;
  getPeerConnection?: () => object | null;
  setVideoSendSettings?: (role: VideoRole, settings: VideoSendSettings | null) => void;
}

/** What to open the camera at: 720p, or wider for native. Lowering is left to the encoder. */
function captureFor(preset: QualityPreset, facing: Facing) {
  const size = preset.quality === "native" ? CAMERA_NATIVE_CAPTURE : { width: 1280, height: 720 };
  return { facingMode: facing, ...size, frameRate: 30 };
}

/**
 * The phone's camera into the call: open it, give the track to the engine, and tell the
 * server with `voice:camera:state`, or the video is sent and nobody draws it.
 */
export function useCamera(
  sfu: VideoSink,
  socket: Socket | null,
  wanted: boolean,
  preset: QualityPreset,
  facing: Facing,
) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  /* Read when the camera opens, so a change of either doesn't reopen it. */
  const latest = useRef({ preset, facing, sfu });
  latest.current = { preset, facing, sfu };
  /* What the open camera was asked for, so a lower preset leaves the capture alone. */
  const captured = useRef<ReturnType<typeof captureFor> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /* The live stream, for the cleanup — which must not depend on the state
   * having re-rendered before it runs. */
  const open = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      const current = open.current;
      open.current = null;
      captured.current = null;
      if (!current) return;
      sfu.removeVideoTrack();
      sfu.setVideoSendSettings?.("camera", null);
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
        const capture = captureFor(latest.current.preset, latest.current.facing);
        const next = (await mediaDevices.getUserMedia({ video: capture })) as MediaStream;

        if (cancelled) {
          for (const track of next.getTracks()) track.stop();
          return;
        }

        const track = next.getVideoTracks()[0];
        if (!track) throw new Error("The camera opened without a video track.");

        open.current = next;
        captured.current = capture;
        setStream(next);
        setProblem(null);
        sfu.addVideoTrack(track as never, next as never);
        sfu.setVideoSendSettings?.("camera", cameraSend(latest.current.preset, sourceOf(track), QUALITY_TOOLS));
        /* Turning the camera off only pauses its sender, so it comes back under the first
         * camera's stream id. Announce that one, or nobody finds the video. */
        const streamId = senderStreamId(sfu.getPeerConnection?.(), "camera", next.id);
        socket?.emit("voice:camera:state", { enabled: true, streamId });
      } catch (error) {
        if (cancelled) return;
        /* A refusal is the ordinary case here — the permission prompt is the first
         * thing that happens. The sheet says so and the button goes back off. */
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

  /* A new preset or camera on the one already open: the track is reconstrained in place, so
     nothing is renegotiated and the stream id the room knows stays the same. */
  useEffect(() => {
    const track = open.current?.getVideoTracks()[0];
    const before = captured.current;
    if (!track || !before) return;
    const want = captureFor(preset, facing);
    const wider = want.height > before.height;
    const next = { ...before, facingMode: facing, ...(wider ? { width: want.width, height: want.height } : {}) };
    const reopen = wider || before.facingMode !== facing ? track.applyConstraints(next) : Promise.resolve();
    captured.current = next;
    void reopen
      .catch(() => setProblem("The camera couldn't switch."))
      .then(() => latest.current.sfu.setVideoSendSettings?.("camera", cameraSend(preset, sourceOf(track), QUALITY_TOOLS)));
  }, [preset, facing]);

  return { stream, problem };
}
