import { isPairingLink } from "../src/pairing/input";

/** `GRYT:1:` reads as this app's `gryt` scheme, so a system camera may open it here. It goes nowhere. */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (!isPairingLink(path)) return path;
  return initial ? "/" : null;
}
