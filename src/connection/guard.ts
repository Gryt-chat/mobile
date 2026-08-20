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
 * On refusal the queue is dropped and reconnection is turned off. Without that
 * last part a refusal reads to the rest of the app as an ordinary dropped
 * connection and it retries forever, showing "lost connection" rather than what
 * actually happened.
 */
export interface Guard {
  /** Let the queued events go. */
  release: () => void;
  /** Drop them, and stop reconnecting. */
  refuse: () => void;
}

type EmitArgs = [string, ...unknown[]];

export function guardSocket(socket: Socket): Guard {
  let settled = false;
  let queue: EmitArgs[] = [];

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
      socket.emit = originalEmit;
      const pending = queue;
      queue = [];
      for (const [event, ...args] of pending) originalEmit(event, ...args);
    },
    refuse: () => {
      settled = true;
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
