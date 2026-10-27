/**
 * Who is showing their screen. **`server:clients` is the only place the answer exists**
 * — `members:list` carries neither the flag nor the stream ids.
 */

/** The shape of one entry in `server:clients`, narrowed to what is read. */
export interface ServerClient {
  serverUserId?: string;
  nickname?: string;
  voiceChannelId?: string;
  screenShareEnabled?: boolean;
  screenShareVideoStreamID?: string;
  screenShareAudioStreamID?: string;
  /** One per shared window; servers from before GRYT-1905 send only the first window's ids above. */
  screenShares?: { videoStreamID: string; audioStreamID?: string; name?: string }[];
  cameraEnabled?: boolean;
  cameraStreamID?: string;
}

export interface Share {
  /** Whose it is, for the label and for the face beside it. */
  serverUserId: string;
  nickname: string | null;
  /** What to look up in the engine's `videoStreams`. */
  streamId: string;
  /** The window's sound, or "" when it has none. */
  audioStreamId: string;
  /** The window's title, when the sharer's app sends one. */
  name: string | null;
}

/** Every window a client shares, first one first. */
function windowsOf(client: ServerClient) {
  if (client.screenShares?.length) return client.screenShares;
  return [{ videoStreamID: client.screenShareVideoStreamID ?? "", audioStreamID: client.screenShareAudioStreamID }];
}

/**
 * The shares worth drawing, given where you are — filtered to your own voice channel,
 * **and your own is left out**, which on iOS would be a hall of mirrors.
 */
export function sharesFrom(
  clients: Record<string, ServerClient> | null | undefined,
  channelId: string | null,
  me: string | null,
): Share[] {
  if (!clients || !channelId) return [];

  return Object.values(clients).flatMap((client) => {
    const { serverUserId, screenShareVideoStreamID: streamId } = client;
    if (!client.screenShareEnabled) return [];
    /* A client can report the flag with no stream behind it, between the state
     * arriving and the track being published. That draws a black rectangle. */
    if (!streamId) return [];
    if (client.voiceChannelId !== channelId) return [];
    if (!serverUserId || serverUserId === me) return [];
    return windowsOf(client)
      .filter((w) => w.videoStreamID)
      .map((w) => ({
        serverUserId,
        nickname: client.nickname || null,
        streamId: w.videoStreamID,
        audioStreamId: w.audioStreamID ?? "",
        name: w.name || null,
      }));
  });
}

/**
 * Whose camera is on, as user id to stream id — the same two-field pattern as a share.
 * **Your own is included here**, unlike a share, so a self view is not a special case.
 */
export function camerasFrom(
  clients: Record<string, ServerClient> | null | undefined,
  channelId: string | null,
): Map<string, string> {
  const cameras = new Map<string, string>();
  if (!clients || !channelId) return cameras;

  for (const client of Object.values(clients)) {
    if (!client.cameraEnabled || !client.cameraStreamID) continue;
    if (client.voiceChannelId !== channelId) continue;
    if (!client.serverUserId) continue;
    cameras.set(client.serverUserId, client.cameraStreamID);
  }
  return cameras;
}

/**
 * Every stream id in this channel that is a camera or a share rather than a person, a share's
 * sound included, or it gets a tile of its own. **Your own are included, unlike `sharesFrom`.**
 */
export function videoStreamIds(
  clients: Record<string, ServerClient> | null | undefined,
  channelId: string | null,
): Set<string> {
  const ids = new Set<string>();
  if (!clients || !channelId) return ids;

  for (const client of Object.values(clients)) {
    if (client.voiceChannelId !== channelId) continue;
    if (client.cameraStreamID) ids.add(client.cameraStreamID);
    if (client.screenShareVideoStreamID) ids.add(client.screenShareVideoStreamID);
    if (client.screenShareAudioStreamID) ids.add(client.screenShareAudioStreamID);
    for (const w of client.screenShares ?? []) {
      if (w.videoStreamID) ids.add(w.videoStreamID);
      if (w.audioStreamID) ids.add(w.audioStreamID);
    }
  }
  return ids;
}

interface StreamLike {
  isLocal: boolean;
  kind?: "audio" | "video";
  stream?: { getAudioTracks?: () => unknown[]; getVideoTracks?: () => unknown[] };
}

/** The remote streams that are people. A camera switched off lingered in the engine and was drawn
    as "Someone" (GRYT-1650), so an id ever video stays video, and video-only is not a person. */
export function personStreamIds(
  streams: Record<string, StreamLike>,
  videoNow: Set<string>,
  videoEver: Set<string>,
): string[] {
  return Object.entries(streams)
    .filter(([id, s]) => {
      if (s.isLocal || s.kind === "video") return false;
      if (videoNow.has(id) || videoEver.has(id)) return false;
      const audio = s.stream?.getAudioTracks?.().length;
      const video = s.stream?.getVideoTracks?.().length;
      return !(audio === 0 && (video ?? 0) > 0);
    })
    .map(([id]) => id);
}

/** Plus whoever the server puts in the channel with no stream here: own-transport voice never
    reaches WebRTC, so they had no tile at all (GRYT-1818). Keyed by their stream id, as the rest. */
export function withChannelMembers(
  streamIds: string[],
  members: Iterable<{ serverUserId: string; streamID?: string; voiceChannelId?: string }>,
  channelId: string | null,
  selfId: string | null,
): string[] {
  const ids = [...streamIds];
  for (const m of members) {
    if (!channelId || m.voiceChannelId !== channelId || m.serverUserId === selfId || !m.streamID) continue;
    if (!ids.includes(m.streamID)) ids.push(m.streamID);
  }
  return ids;
}
