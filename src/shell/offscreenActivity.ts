export interface PlacedActivity {
  key: string;
  top: number;
  height: number;
  mentions: number;
}

export type Side = "above" | "below";

/** The rows out of view on that side, nearest first. A row is out once its middle is past the edge. */
export function activityOn(rows: PlacedActivity[], side: Side, viewTop: number, viewBottom: number): PlacedActivity[] {
  const out = rows.filter((row) => {
    const middle = row.top + row.height / 2;
    return side === "above" ? middle < viewTop : middle > viewBottom;
  });
  return out.sort((a, b) => (side === "above" ? b.top - a.top : a.top - b.top));
}

/** The row a press goes to: the nearest mention if there is one, since the pill says mentions then. */
export function nextActivity(rows: PlacedActivity[]): PlacedActivity | undefined {
  return rows.find((row) => row.mentions > 0) ?? rows[0];
}
