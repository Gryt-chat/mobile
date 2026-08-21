import { useCallback, useEffect, useState } from "react";

import {
  audioRouteAvailable,
  audioRoutes,
  currentAudioRoute,
  onAudioRouteChange,
  selectAudioRoute,
  type AudioRoute,
} from "../../modules/audio-route";

export interface AudioRouteState {
  /** What is playing now. Null before the session is up. */
  current: AudioRoute | null;
  /** Everything that could be picked. Empty where there is no choice. */
  options: AudioRoute[];
  /** Why the last pick failed, if it did. Cleared by the next one. */
  problem: string | null;
  /** True when the session took it. False leaves `problem` saying why not. */
  select: (id: string) => boolean;
  /** False on Android and in a build that has not picked the module up. */
  available: boolean;
}

/**
 * Where the call comes out, and how to move it.
 *
 * Reads on mount and again on every route change, because the route moves
 * without being asked: a headset unplugged, a car connected, an interruption
 * that ends somewhere else. Polling would be the alternative and would be
 * wrong — the session tells you.
 *
 * `active` is when there is a call. Before one, `AVAudioSession` is not in
 * `playAndRecord` and the list is whatever the phone happened to be doing, so
 * this stops reading rather than showing a list nobody can act on.
 */
export function useAudioRoute(active: boolean): AudioRouteState {
  const [current, setCurrent] = useState<AudioRoute | null>(null);
  const [options, setOptions] = useState<AudioRoute[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const read = useCallback(() => {
    setCurrent(currentAudioRoute());
    setOptions(audioRoutes());
  }, []);

  useEffect(() => {
    if (!active) {
      setCurrent(null);
      setOptions([]);
      setProblem(null);
      return;
    }

    read();
    return onAudioRouteChange(() => read());
  }, [active, read]);

  const select = useCallback(
    (id: string) => {
      let worked = true;
      try {
        selectAudioRoute(id);
        setProblem(null);
      } catch (error) {
        setProblem(error instanceof Error ? error.message : String(error));
        worked = false;
      }
      /* Read back rather than assuming. `overrideOutputAudioPort` can succeed
       * and still not be what the session settles on — a preferred input the
       * hardware refuses leaves the route where it was, quietly. */
      read();
      return worked;
    },
    [read],
  );

  return { current, options, problem, select, available: audioRouteAvailable };
}
