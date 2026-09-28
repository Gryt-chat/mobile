import type { MlsDeviceRef, MlsRefusal, MlsReply, MlsTransport } from "@gryt/core";

/** A reply object before its bytes are turned into Uint8Arrays. */
type Wire = Record<string, unknown>;

/** The part of a socket.io socket the transport uses. */
export interface AckSocket {
  emit(event: string, payload: unknown, ack: (reply: unknown) => void): unknown;
}

/**
 * socket.io-parser drops the whole connection past 10 binary attachments in one packet, on
 * either end. So KeyPackages go up in batches and the log comes down in pages (GRYT-1522).
 */
const MAX_BINARY_PER_EVENT = 10;

/** Long enough for a commit carrying a Welcome on a slow cell connection. */
const ACK_TIMEOUT_MS = 15_000;

const refusal = (error: string, message: string): MlsRefusal => ({ ok: false, error, message });

/** Binary arrives as an ArrayBuffer in React Native and as a Buffer in node. */
export function asBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error("Expected binary data from the server.");
}

type Publish = Parameters<MlsTransport["publishKeyPackages"]>[0];

export interface TransportOptions {
  socket: AckSocket;
  getAccessToken: () => Promise<string | null>;
  /**
   * KeyPackages made again with the server's clock, after it refused them as out of date
   * (server#242). Returns null when it can't.
   */
  remake?: (req: Publish, serverTime: number) => Promise<Publish | null>;
  /** Per conversation: whether the next `mls:send` leaves a line for old apps (GRYT-1517). */
  placeholderFor?: (conversationId: string) => boolean;
  timeoutMs?: number;
}

/** At most 10 packages a call, the last-resort one in the last call. */
function batches(req: Publish): Publish[] {
  const out: Publish[] = [];
  const room = MAX_BINARY_PER_EVENT - 1;
  for (let i = 0; i < req.keyPackages.length; i += room) {
    out.push({ deviceId: req.deviceId, keyPackages: req.keyPackages.slice(i, i + room) });
  }
  if (out.length === 0) out.push({ deviceId: req.deviceId, keyPackages: [] });
  if (req.lastResort) out[out.length - 1].lastResort = req.lastResort;
  return out;
}

/** The mls:* events from server#241, with the access token added to each. */
export function socketMlsTransport(options: TransportOptions): MlsTransport {
  const { socket, getAccessToken, timeoutMs = ACK_TIMEOUT_MS } = options;

  async function request<T>(event: string, payload: Record<string, unknown>): Promise<MlsReply<T>> {
    const accessToken = await getAccessToken();
    if (!accessToken) return refusal("unauthenticated", "Not signed in to this server.");
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(refusal("timeout", `No answer to ${event}.`)), timeoutMs);
      socket.emit(event, { accessToken, ...payload }, (reply) => {
        clearTimeout(timer);
        resolve(
          reply && typeof reply === "object" && "ok" in reply
            ? (reply as MlsReply<T>)
            : refusal("invalid_reply", `${event} answered with something unreadable.`),
        );
      });
    });
  }

  async function publish(req: Publish) {
    return request<{ stored: number; unclaimed: number; lastResort: boolean }>("mls:keypackages:publish", {
      deviceId: req.deviceId,
      keyPackages: req.keyPackages,
      ...(req.lastResort ? { lastResort: req.lastResort } : null),
    });
  }

  return {
    async publishKeyPackages(req) {
      let r: Awaited<ReturnType<typeof publish>> = { ok: false, error: "invalid_payload", message: "Nothing to publish." };
      for (const part of batches(req)) {
        r = await publish(part);
        const serverTime = !r.ok && typeof r.serverTime === "number" ? r.serverTime : null;
        if (!r.ok && serverTime !== null && options.remake) {
          // A phone clock more than an hour out. One more go on the server's time.
          const again = await options.remake(part, serverTime);
          if (again) r = await publish(again);
        }
        if (!r.ok) return r;
      }
      return r;
    },

    async claimKeyPackages(req) {
      const r = await request<{ keyPackages: Wire[]; missing: MlsDeviceRef[] }>("mls:keypackages:claim", req);
      if (!r.ok) return r;
      return { ...r, keyPackages: r.keyPackages.map((k) => ({ ...k, keyPackage: asBytes(k.keyPackage) }) as never) };
    },

    listDevices: (req) => request("mls:devices", req),
    removeDevice: (req) => request("mls:device:remove", req),
    createGroup: (req) => request("mls:group:create", req),

    commit: (req) =>
      request("mls:commit", {
        conversationId: req.conversationId,
        deviceId: req.deviceId,
        commit: req.commit,
        ...(req.welcome ? { welcome: req.welcome } : null),
      }),

    send: (req) =>
      request("mls:send", {
        ...req,
        ...(options.placeholderFor?.(req.conversationId) === false ? { placeholder: false } : null),
      }),

    async fetchLog(req) {
      const limit = Math.min(req.limit ?? MAX_BINARY_PER_EVENT, MAX_BINARY_PER_EVENT);
      const r = await request<{ entries: Wire[] }>("mls:log:fetch", { ...req, limit });
      if (!r.ok) return r;
      return { ...r, entries: r.entries.map((e) => ({ ...e, data: asBytes(e.data) })) } as never;
    },

    async sync(req) {
      const r = await request<{ welcomes: Wire[] }>("mls:sync", req);
      if (!r.ok) return r;
      return { ...r, welcomes: r.welcomes.map((w) => ({ ...w, data: asBytes(w.data) })) } as never;
    },

    ackWelcomes: (req) => request("mls:welcome:ack", req),
  };
}
