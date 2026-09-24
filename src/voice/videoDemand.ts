import type { VideoDemand } from "@gryt/voice/native";

/** Where a remote video is drawn, in points: the tile's box. */
export interface DrawnBox {
  width: number;
  height: number;
}

/**
 * Per remote video, its box in device pixels, or 0x0 when it's drawn nowhere or nothing is
 * on screen. The tile's box sets the same rung as the video `cover` or `contain` draws in it.
 */
export function videoDemandFor(
  streamIds: Iterable<string>,
  drawn: ReadonlyMap<string, DrawnBox>,
  visible: boolean,
  pixelRatio: number,
): Map<string, VideoDemand> {
  const out = new Map<string, VideoDemand>();
  for (const id of streamIds) {
    const box = visible ? drawn.get(id) : undefined;
    out.set(
      id,
      box && box.width > 0 && box.height > 0
        ? { width: Math.round(box.width * pixelRatio), height: Math.round(box.height * pixelRatio) }
        : { width: 0, height: 0 },
    );
  }
  return out;
}
