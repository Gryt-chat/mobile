import { useEffect, useRef } from "react";

import { gainOf, type UserAudio } from "./userVolumes";

/** The part of a `react-native-webrtc` track this needs. `_setVolume` takes a gain of 0 to 10. */
export interface VolumeTrack {
  id: string;
  _setVolume?: (volume: number) => void;
}

export interface GainStream {
  isLocal?: boolean;
  stream: { getAudioTracks(): unknown[] };
}

/**
 * Sets each remote audio track to its person's gain. `applied` remembers what each track was
 * given, so a track only crosses the bridge when its number changes. A new track starts at 1.
 */
export function applyUserGains(
  streams: Record<string, GainStream>,
  whoIs: (streamId: string) => string | null | undefined,
  audio: UserAudio,
  applied: Map<string, number>,
): void {
  const seen = new Set<string>();
  for (const [streamId, data] of Object.entries(streams)) {
    if (data.isLocal) continue;
    const gain = gainOf(audio, whoIs(streamId));
    for (const raw of data.stream.getAudioTracks()) {
      const track = raw as VolumeTrack;
      seen.add(track.id);
      if ((applied.get(track.id) ?? 1) === gain) continue;
      track._setVolume?.(gain);
      applied.set(track.id, gain);
    }
  }
  for (const id of [...applied.keys()]) {
    if (!seen.has(id)) applied.delete(id);
  }
}

/** Keeps the call's remote tracks at the volumes you picked, as people join and as you drag. */
export function useUserGains(
  streams: Record<string, GainStream>,
  whoIs: (streamId: string) => string | null | undefined,
  audio: UserAudio,
): void {
  const applied = useRef(new Map<string, number>());
  useEffect(() => {
    applyUserGains(streams, whoIs, audio, applied.current);
  }, [streams, whoIs, audio]);
}
