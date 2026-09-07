import { useCallback, useEffect, useRef, useState } from "react";
import { mediaDevices, RTCPeerConnection, type MediaStream } from "react-native-webrtc";

import { HISTORY, micVerdict, pushLevel, readMicStats, type Verdict } from "./micTest";

/** Ten a second. Fast enough to look live, slow enough that the bridge is idle. */
const POLL_MS = 100;

/**
 * Open the microphone, send it to nowhere, and watch both halves.
 *
 * **Its own capture and its own connection, on purpose.** It would be shorter
 * to read the engine's peer connection while a call is running, and it would
 * measure the thing under suspicion using the thing under suspicion. This opens
 * the microphone the same way the engine does and sends it to a second
 * connection on this phone, so a green result means the phone can capture and
 * encode and send — and a call that is silent anyway is Gryt's fault rather
 * than the device's.
 *
 * The second connection exists only to give the first one somewhere to send.
 * Without a peer, nothing is encoded and `bytesSent` never moves, which is
 * exactly the reading this is for. No STUN: both ends are on this device and
 * host candidates reach each other.
 *
 * **The received track is disabled the moment it arrives.** `react-native-webrtc`
 * plays remote audio through the session as soon as it is attached, and the
 * loudspeaker feeding the microphone it is testing is a howl, not a test.
 */
export function useMicCheck(running: boolean) {
  const [history, setHistory] = useState<number[]>(() => Array<number>(HISTORY).fill(0));
  const [verdict, setVerdict] = useState<Verdict>({ state: "starting", message: "Starting…" });
  const [bytesSent, setBytesSent] = useState<number | null>(null);

  /* Held in refs rather than state: the poll reads them every tick and none of
     them should re-render anything on their own. */
  const historyRef = useRef<number[]>(Array<number>(HISTORY).fill(0));
  const streamRef = useRef<MediaStream | null>(null);
  const localRef = useRef<RTCPeerConnection | null>(null);
  const remoteRef = useRef<RTCPeerConnection | null>(null);
  const firstBytesRef = useRef<number | null>(null);
  const startedRef = useRef(0);

  const stop = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    localRef.current?.close();
    remoteRef.current?.close();
    localRef.current = null;
    remoteRef.current = null;
    firstBytesRef.current = null;
  }, []);

  useEffect(() => {
    if (!running) {
      stop();
      historyRef.current = Array<number>(HISTORY).fill(0);
      setHistory(historyRef.current);
      setBytesSent(null);
      setVerdict({ state: "starting", message: "Starting…" });
      return;
    }

    let live = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    startedRef.current = Date.now();

    const fail = (error: unknown) => {
      if (!live) return;
      const message = error instanceof Error ? error.message : String(error);
      setVerdict({ state: "blocked", message });
    };

    (async () => {
      try {
        const stream = await mediaDevices.getUserMedia({ audio: true });
        if (!live) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;

        const local = new RTCPeerConnection({ iceServers: [] });
        const remote = new RTCPeerConnection({ iceServers: [] });
        localRef.current = local;
        remoteRef.current = remote;

        /* The `on*` setters rather than `addEventListener`. This class extends
           the package's own `EventTarget`, whose listener map does not carry
           these events, so the string form does not typecheck. */
        local.onicecandidate = (event: any) => {
          if (event.candidate) void remote.addIceCandidate(event.candidate);
        };
        remote.onicecandidate = (event: any) => {
          if (event.candidate) void local.addIceCandidate(event.candidate);
        };
        /* Silenced on arrival — see the note on this hook. */
        remote.ontrack = (event: any) => {
          for (const track of event.streams?.[0]?.getTracks() ?? []) track.enabled = false;
        };

        for (const track of stream.getTracks()) local.addTrack(track, stream);

        const offer = await local.createOffer({});
        await local.setLocalDescription(offer);
        await remote.setRemoteDescription(local.localDescription!);
        const answer = await remote.createAnswer();
        await remote.setLocalDescription(answer);
        await local.setRemoteDescription(remote.localDescription!);

        if (!live) return;

        timer = setInterval(() => {
          void (async () => {
            const pc = localRef.current;
            if (!pc) return;
            let report: Iterable<[string, unknown]> | null = null;
            try {
              report = (await pc.getStats()) as unknown as Iterable<[string, unknown]>;
            } catch {
              /* getStats throws on a connection that is closing, which is the
                 ordinary way this ends. Nothing to report. */
              return;
            }
            if (!live) return;

            const stats = readMicStats(report);
            if (stats.bytesSent !== null && firstBytesRef.current === null) {
              firstBytesRef.current = stats.bytesSent;
            }
            /* The history is kept in a ref and mirrored into state rather than
               updated with the callback form. The verdict is derived from it,
               and deriving it inside a state updater means computing it again
               every time React chooses to call that updater twice. */
            const next = pushLevel(historyRef.current, stats.level ?? 0);
            historyRef.current = next;

            setBytesSent(stats.bytesSent);
            setHistory(next);
            setVerdict(
              micVerdict({
                error: null,
                history: next,
                bytesSent: stats.bytesSent,
                firstBytesSent: firstBytesRef.current,
                elapsedMs: Date.now() - startedRef.current,
              }),
            );
          })();
        }, POLL_MS);
      } catch (error) {
        fail(error);
      }
    })();

    return () => {
      live = false;
      if (timer) clearInterval(timer);
      stop();
    };
  }, [running, stop]);

  return { history, verdict, bytesSent };
}
