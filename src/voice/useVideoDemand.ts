import { useEffect, useRef, useState } from "react";
import { AppState, PixelRatio } from "react-native";
import type { VideoDemand } from "@gryt/voice/native";

import { videoDemandFor, type DrawnBox } from "./videoDemand";

type Report = (streamId: string, size: VideoDemand | null) => void;

/**
 * Tells the engine how big each remote video is drawn, and null once it's gone. Only changes
 * go out, since the engine restarts its send timer on every call (GRYT-1432).
 */
export function useVideoDemand(
  report: Report | undefined,
  streamIds: readonly string[],
  drawn: ReadonlyMap<string, DrawnBox>,
  open: boolean,
) {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => sub.remove();
  }, []);

  const sent = useRef(new Map<string, string>());
  const key = streamIds.join("\n");

  useEffect(() => {
    if (!report) return;
    const next = videoDemandFor(streamIds, drawn, open && active, PixelRatio.get());
    for (const id of [...sent.current.keys()]) {
      if (next.has(id)) continue;
      sent.current.delete(id);
      report(id, null);
    }
    for (const [id, size] of next) {
      const value = `${size.width}x${size.height}`;
      if (sent.current.get(id) === value) continue;
      sent.current.set(id, value);
      report(id, size);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, key, drawn, open, active]);
}
