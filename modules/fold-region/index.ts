import { requireOptionalNativeModule } from "expo-modules-core";

export interface FoldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const native = requireOptionalNativeModule<{ current(): Promise<FoldRect | null> }>("FoldRegion");

export function currentFold(): Promise<FoldRect | null> {
  return native ? native.current() : Promise.resolve(null);
}
