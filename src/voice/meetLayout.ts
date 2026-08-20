/**
 * Where each tile goes, Meet's way.
 *
 * Pure arithmetic in its own file so it can be tested without a renderer —
 * same shape as `sliderValue.ts` in `@gryt/ui-native`, and for the same reason:
 * the last two layout bugs in this codebase were arithmetic, and arithmetic is
 * the part a screenshot is worst at checking.
 *
 * The numbers come from GRYT-64, measured from a live Meet session at a
 * phone-sized viewport rather than estimated from screenshots.
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
 * How much of the height the shares take when there are any.
 *
 * A share is the one surface that genuinely wants area — text becomes
 * unreadable when it is small — so it gets the larger half. The people below
 * are recognisable at a glance in a way a terminal is not.
 */
const SHARE_FRACTION = 0.55;

/**
 * Tiles have **no target aspect ratio**. They stretch to fill.
 *
 * This is the part most likely to be got wrong, because the desktop client does
 * the opposite: `computeOptimalColumns` scores candidates against a fixed
 * `TILE_ASPECT = 4/3`. Meet picks the column count that maximises tile *area*
 * and then lets the tiles fill whatever is left, which is why four people stack
 * in one column on a tall narrow phone and form a 2x2 on a squarer viewport —
 * same optimiser, no special-casing by count.
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
   * Shares are pinned full width across the top, people below — measured from
   * Meet across three arrangements: a share plus two gives a full-width share
   * and two stacked; plus three gives the share, one full-width, then two
   * across; plus four gives the share then a 2x2.
   *
   * So the shares are not part of the grid at all. Feeding them through the
   * optimiser would let a share end up beside a face at half width, which is
   * the one thing a share cannot survive.
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
    // full-width then two half-width, not two-then-one. Measured from Meet,
    // and it is the opposite of what filling left-to-right gives you.
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
 * Two people is hero plus picture-in-picture, and that is deliberately not the
 * optimiser's answer — it would stack them.
 *
 * GRYT-123 is the open question about whether this should be a choice rather
 * than a fixed behaviour: hero-plus-PiP gives the person you are talking to
 * more pixels, equal tiles are better when you are both watching something.
 * Both are defensible, which is the argument for a setting rather than for
 * swapping one hardcoded answer for another.
 */
export const PIP = {
  width: 116,
  height: 156,
  /**
   * Inset from the *container*, so it has to clear the container padding as
   * well as its own gap — otherwise it hangs over the hero tile's edge, which
   * is what it did at 12: the hero starts at MEET_PADDING and the PiP was
   * sitting four points outside it.
   */
  inset: MEET_PADDING + 12,
  radius: 12
};
