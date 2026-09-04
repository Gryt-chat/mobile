/**
 * Who is showing their screen, out of what the server says about everybody.
 *
 * **`server:clients` is the only place the answer exists** — `members:list`,
 * which the drawer and the voice tiles are built from, does not carry
 * `screenShareEnabled` or the stream ids beside it.
 *
 * Pure, because the interesting parts are invisible filtering rules: a share in
 * another channel, your own coming back to you, and a client that says it is
 * sharing without saying which stream.
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
 * The shares worth drawing, given where you are. Filtered to your own voice
 * channel, since `server:clients` is the whole server — **and your own is left
 * out**, which on iOS would be a hall of mirrors: the share is of whatever is
 * on screen, which would be the drawing of the share.
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
      /* A client can report the flag with no stream behind it — between
       * `voice:screen:state` arriving and the track being published, and after
       * a share ends if the flag is cleared in the wrong order. Drawing that is
       * a black rectangle with somebody's name under it. */
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
 * Whose camera is on, as user id to stream id.
 *
 * The same event and the same two-field pattern as a screen share —
 * `cameraEnabled` beside `cameraStreamID` — and the same reason for checking
 * both: the flag and the stream are set by different code paths and can be a
 * moment apart.
 *
 * A map rather than a list, because this is looked up per tile: the voice view
 * draws a person and asks whether that person has a picture, where a share is
 * its own tile and is iterated.
 *
 * **Your own is included here**, unlike a share. A self view is a thing people
 * expect and the local preview is drawn from the local track rather than from
 * anything the SFU sends back — but leaving yourself out of the map would make
 * that a special case at the call site rather than here.
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
 * Every stream id in this channel that carries video rather than a person. The
 * voice tiles walk the engine's `streams` assuming each is a microphone, so a
 * camera or share landing there becomes a tile with no member behind it — the
 * "someone" who turns up when a webcam goes off and the engine renegotiates.
 *
 * **Cameras and your own are included, unlike `sharesFrom`.** This is the list
 * of ids that are not people, not the list of things to draw.
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
