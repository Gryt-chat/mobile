export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Moves a tour card off the fold. Across a sideways fold it stays in its target's half.
 * Across an upright one it goes above if that leaves the target showing, otherwise below.
 */
export function clearFold(
  card: { top: number; left: number; width: number; height: number },
  target: Rect,
  fold: Rect | null,
  gap: number,
): { top: number; left: number } {
  const { top, left, width, height } = card;
  if (!fold) return { top, left };
  if (fold.height > fold.width) {
    if (left >= fold.x + fold.width || left + width <= fold.x) return { top, left };
    const targetIsLeft = target.x + target.width / 2 < fold.x;
    return { top, left: targetIsLeft ? Math.max(gap, fold.x - width - gap) : fold.x + fold.width + gap };
  }
  if (top >= fold.y + fold.height || top + height <= fold.y) return { top, left };
  const above = fold.y - height - gap;
  return { top: above + height <= target.y ? above : fold.y + fold.height + gap, left };
}
