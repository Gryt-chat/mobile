import type { Socket } from "socket.io-client";

/**
 * Hold everything back until the server has proved who it is.
 *
 * `socket.emit` is replaced with one that queues, and only `server:identify`
 * gets through. That is a deliberate copy of what the desktop client does, and
 * the reason is worth keeping: without it, any code path that emits on connect
 * — a session restore, a details request — reaches a server nobody has checked
 * yet. Queueing means a new call site cannot get that wrong by default.
 *
 * **Every connection is guarded, not just the first.** A reconnect is a fresh
 * TCP connection to whatever answers that address now, which is not necessarily
 * what answered a minute ago. `hold` puts the queue back in place the moment
 * the socket drops, so anything emitted in the gap waits for the new proof
 * rather than going out on trust earned by the old one.
 *
 * On refusal the queue is dropped and reconnection is turned off. Without that
 * last part a refusal reads to the rest of the app as an ordinary dropped
 * connection and it retries forever, showing "lost connection" rather than what
 * actually happened.
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
