import { useEffect, useRef, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

/** Window coordinates, the shape `measureInWindow` and `@gryt/ui-native`'s
 * `placePopup` both already use. */
export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A module map rather than a context: the targets live in three different screens,
 * far from where the tour mounts, so there is no shared provider to hang this off.
 */
const targets = new Map<string, View>();

/**
 * Marks the real control a tour step points at. The phone has no `data-tour`
 * attribute to query, so a registration by id substitutes for one.
 */
export function TourTarget({
  id,
  style,
  children,
}: {
  id: string;
  /** Passed straight through — a `flex: 1` sibling needs the wrapper to keep it. */
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const ref = useRef<View>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    targets.set(id, node);
    return () => {
      if (targets.get(id) === node) targets.delete(id);
    };
  }, [id]);

  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}

/**
 * Where a registered target is on screen right now, or null when it is not mounted
 * or has no size yet — a target inside an inactive tab page waits on this.
 */
export function measureTourTarget(id: string): Promise<AnchorRect | null> {
  return new Promise((resolve) => {
    const node = targets.get(id);
    if (!node) {
      resolve(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      resolve(width || height ? { x, y, width, height } : null);
    });
  });
}

/** Test-only: clears every registration so one spec cannot see another's targets. */
export function __resetTourTargetsForTests(): void {
  targets.clear();
}
