import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";

/** Where the sender's face is in their raw frame, 0..1 on each axis. */
export interface Framing {
  x: number;
  y: number;
}

/** `voice:framing` by the sender's client id, the key `server:clients` uses. */
export function useFraming(socket: Socket | null): Record<string, Framing> {
  const [byClient, setByClient] = useState<Record<string, Framing>>({});

  useEffect(() => {
    setByClient({});
    if (!socket) return;
    const onFraming = (p: { clientId: string; x: number; y: number }) =>
      setByClient((prev) => ({ ...prev, [p.clientId]: { x: p.x, y: p.y } }));
    socket.on("voice:framing", onFraming);
    return () => {
      socket.off("voice:framing", onFraming);
    };
  }, [socket]);

  return byClient;
}

/** CSS `object-fit: cover` plus `object-position`, as a box to draw the whole video in. RTCView has no object-position. */
export function coverRect(
  box: { width: number; height: number },
  video: { width: number; height: number },
  framing: Framing,
) {
  const scale = Math.max(box.width / video.width, box.height / video.height);
  const width = video.width * scale;
  const height = video.height * scale;
  return {
    width,
    height,
    left: (box.width - width) * framing.x,
    top: (box.height - height) * framing.y,
  };
}
