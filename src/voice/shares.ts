/**
 * Who is showing their screen, out of what the server says about everybody.
 * **`server:clients` is the only place the answer exists** — `members:list` carries
 * neither `screenShareEnabled` nor the stream ids beside it.
 */

/** The shape of one entry in `server:clients`, narrowed to what is read. */
export interface ServerClient {
  serverUserId?: string;
  nickname?: string;
  voiceChannelId?: string;
  screenShareEnabled?: boolean;
  screenShareVideoStreamID?: string;
  cameraEnabled?: boolean;
  cameraStreamID?: string;
}

export interface Share {
  /** Whose it is, for the label and for the face beside it. */
  serverUserId: string;
  nickname: string | null;
  /** What to look up in the engine's `videoStreams`. */
  streamId: string;
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

  return Object.values(clients)
    .filter((client) => {
      if (!client.screenShareEnabled) return false;
      /* A client can report the flag with no stream behind it, between the state
       * arriving and the track being published. That draws a black rectangle. */
      if (!client.screenShareVideoStreamID) return false;
      if (client.voiceChannelId !== channelId) return false;
      if (!client.serverUserId || client.serverUserId === me) return false;
      return true;
    })
    .map((client) => ({
      serverUserId: client.serverUserId!,
      nickname: client.nickname || null,
      streamId: client.screenShareVideoStreamID!,
    }));
}

/**
 * Whose camera is on, as user id to stream id — the same two-field pattern as a share,
 * checked the same way. A map, because this is looked up per tile.
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
 * Every stream id in this channel that carries video rather than a person, or a camera
 * landing in `streams` becomes a tile with no member behind it.
 * **Cameras and your own are included, unlike `sharesFrom`.**
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
  }
  return ids;
}
