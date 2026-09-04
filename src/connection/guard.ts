import type { Socket } from "socket.io-client";

/**
 * Hold everything back until the server has proved who it is. `socket.emit` is
 * replaced with one that queues, so a new call site cannot reach an unchecked
 * server by default.
 *
 * **Every connection is guarded, not just the first** — a reconnect reaches
 * whatever answers that address now. **On refusal, reconnection is turned off
 * as well**, or it retries forever showing "lost connection".
 */
export interface Guard {
  /** Let the queued events go. */
  release: () => void;
  /** Queue again — the connection they were released for is gone. */
  hold: () => void;
  /** Drop them, and stop reconnecting. */
  refuse: () => void;
}

type EmitArgs = [string, ...unknown[]];

export function guardSocket(socket: Socket): Guard {
  let settled = false;
  let queue: EmitArgs[] = [];

  /* The wrapper stays for the life of the socket rather than being swapped out
   * on release: it has to be able to start queueing again, and restoring the
   * original emit would mean re-wrapping — wrapping the wrapper — on every
   * reconnect. While released it is a passthrough. */
  const originalEmit = socket.emit.bind(socket);

  socket.emit = ((event: string, ...args: unknown[]) => {
    if (settled || event === "server:identify") {
      return originalEmit(event, ...args);
    }
    queue.push([event, ...args]);
    return socket;
  }) as typeof socket.emit;

  return {
    release: () => {
      settled = true;
      const pending = queue;
      queue = [];
      for (const [event, ...args] of pending) originalEmit(event, ...args);
    },
    hold: () => {
      settled = false;
    },
    refuse: () => {
      settled = false;
      queue = [];
      try {
        socket.io.opts.reconnection = false;
        socket.disconnect();
      } catch {
        // Already gone.
      }
    },
  };
}
