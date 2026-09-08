/**
 * Where each tile goes, Meet's way. Pure arithmetic in its own file so it can be
 * tested; the numbers are measured from a live Meet session (GRYT-64).
 */

/** 16px container padding, 12px gaps. Measured, not chosen. */
export const MEET_PADDING = 16;
export const MEET_GAP = 12;
export const MEET_RADIUS = 16;

/** The avatar is 31.6% of the tile's width, centred on both axes. */
export const AVATAR_FRACTION = 0.316;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MeetLayout {
  columns: number;
  /** People, below any shares. */
  tiles: Box[];
  /** Screen shares, pinned full width across the top. */
  shares: Box[];
}

/**
 * How much of the height the shares take when there are any. A share is the one
 * surface that genuinely wants area — text becomes unreadable when it is small.
 */
const SHARE_FRACTION = 0.55;

/**
 * Tiles have **no target aspect ratio**; they stretch to fill, unlike the desktop's
 * fixed 4/3. Maximising tile *area* is what makes four stack on a narrow phone.
 */
export function meetLayout(
  count: number,
  width: number,
  height: number,
  shareCount = 0,
): MeetLayout {
  if (width <= 0 || height <= 0) return { columns: 1, tiles: [], shares: [] };
  if (count <= 0 && shareCount <= 0) return { columns: 1, tiles: [], shares: [] };

  const innerW = width - MEET_PADDING * 2;
  const fullH = height - MEET_PADDING * 2;

  /*
   * Shares are pinned full width across the top, people below. **They are not part of
   * the grid at all** — through the optimiser one could end up beside a face.
   */
  const shares: Box[] = [];
  let gridTop = MEET_PADDING;
  let innerH = fullH;

  if (shareCount > 0) {
    const band = count > 0 ? fullH * SHARE_FRACTION : fullH;
    const each = (band - MEET_GAP * (shareCount - 1)) / shareCount;
    for (let i = 0; i < shareCount; i++) {
      shares.push({
        x: MEET_PADDING,
        y: MEET_PADDING + i * (each + MEET_GAP),
        width: innerW,
        height: each,
      });
    }
    gridTop = MEET_PADDING + band + (count > 0 ? MEET_GAP : 0);
    innerH = count > 0 ? fullH - band - MEET_GAP : 0;
  }

  if (count <= 0 || innerH <= 0) return { columns: 1, tiles: [], shares };

  let best = { columns: 1, area: -1 };

  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const tileW = (innerW - MEET_GAP * (columns - 1)) / columns;
    const tileH = (innerH - MEET_GAP * (rows - 1)) / rows;
    if (tileW <= 0 || tileH <= 0) continue;

    const area = tileW * tileH;
    if (area > best.area) best = { columns, area };
  }

  const { columns } = best;
  const rows = Math.ceil(count / columns);
  const tileW = (innerW - MEET_GAP * (columns - 1)) / columns;
  const tileH = (innerH - MEET_GAP * (rows - 1)) / rows;

  const tiles: Box[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / columns);
    const col = i % columns;

    // Uneven counts: the *first* row spans. Three tiles in two columns is one
    // full-width then two half-width, which is the opposite of filling left to right.
    const inThisRow = row === 0 ? count - columns * (rows - 1) : columns;
    const spanning = inThisRow < columns && row === 0;
    const w = spanning
      ? (innerW - MEET_GAP * (inThisRow - 1)) / inThisRow
      : tileW;
    const xIndex = spanning ? col : col;

    tiles.push({
      x: MEET_PADDING + xIndex * (w + MEET_GAP),
      y: gridTop + row * (tileH + MEET_GAP),
      width: w,
      height: tileH,
    });
  }

  return { columns, tiles, shares };
}

/**
 * Two people is hero plus picture-in-picture, **deliberately not the optimiser's
 * answer**, which would stack them. Whether it should be a choice is GRYT-123.
 */
export const PIP = {
  width: 116,
  height: 156,
  /**
   * Inset from the *container*, so it has to clear the container padding as well as
   * its own gap — at 12 it sat four points outside the hero tile.
   */
  inset: MEET_PADDING + 12,
  radius: 12
};
