/**
 * Which remote streams carry a voice this device already hears over the own transport. The
 * engine silences them; only the app can say, since `@gryt/voice` carries no identity.
 */

import { useEffect, useRef } from "react";

/** The engine's stream map, narrowed to the one field this reads. */
export interface DedupeStream {
  isLocal: boolean;
}

/**
 * A stream is a duplicate when its person is heard on the transport too. Local streams are
 * never one: the engine leaves your own track alone, and you are not in `transportUsers`.
 */
export function duplicateStreamIds(
  streams: Record<string, DedupeStream>,
  whoIs: (streamId: string) => string | null | undefined,
  transportUsers: ReadonlySet<string> | undefined,
): Set<string> {
  const ids = new Set<string>();
  // Empty off the transport, where every voice arrives over WebRTC and none is a duplicate.
  if (!transportUsers || transportUsers.size === 0) return ids;

  for (const [streamId, stream] of Object.entries(streams)) {
    if (stream.isLocal) continue;
    const user = whoIs(streamId);
    if (user && transportUsers.has(user)) ids.add(streamId);
  }
  return ids;
}

/** Sorted, so the same ids in a different order are not reported as a change. */
function fingerprint(ids: ReadonlySet<string>): string {
  return [...ids].sort().join(",");
}

export function useTransportDedupe(
  streams: Record<string, DedupeStream>,
  whoIs: (streamId: string) => string | null | undefined,
  transportUsers: ReadonlySet<string> | undefined,
  setDuplicateAudioStreams: ((streamIds: ReadonlySet<string>) => void) | undefined,
): void {
  /* A fresh Set each render would re-run the engine's effect each render, and that walks
     every track. Reported only when the ids actually change. */
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!setDuplicateAudioStreams) return;
    const ids = duplicateStreamIds(streams, whoIs, transportUsers);
    const next = fingerprint(ids);
    if (next === sent.current) return;
    sent.current = next;
    setDuplicateAudioStreams(ids);
  }, [streams, whoIs, transportUsers, setDuplicateAudioStreams]);
}
