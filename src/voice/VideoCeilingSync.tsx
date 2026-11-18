import { useEffect } from "react";
import { useSFU } from "@gryt/voice/native";

import { useServerConnection } from "../connection/ConnectionsProvider";

/** Hands this server's video ceiling (a Gryt Cloud plan's) to the engine, which holds every send to it. */
export function VideoCeilingSync() {
  const { state } = useServerConnection();
  const { setVideoCeiling } = useSFU();
  const max = state.status === "ready" ? state.details?.video_max : null;
  const maxHeight = max?.maxHeight;
  const maxFps = max?.maxFps;
  const maxKbps = max?.maxKbps;
  useEffect(() => {
    setVideoCeiling?.(maxHeight && maxFps && maxKbps ? { maxHeight, maxFps, maxKbps } : null);
  }, [maxHeight, maxFps, maxKbps, setVideoCeiling]);
  return null;
}
