import {
  requireOptionalNativeModule,
  type EventSubscription,
} from "expo-modules-core";

/**
 * Where a call comes out.
 *
 * `react-native-webrtc` exposes no route API — `RTCAudioSession` is two CallKit
 * hooks and nothing else — so this is a local Expo module over
 * `AVAudioSession`. iOS only; see `AudioRouteModule.swift` for what it does and
 * does not own.
 *
 * **Optional on purpose.** `requireOptionalNativeModule` returns null on
 * Android and in any JS-only context — a test, or the app running before a
 * rebuild has picked the module up. Everything below is written so that null
 * means "there is no choice to offer" rather than a crash, because the one
 * thing worse than not being able to pick the speaker is the voice sheet
 * refusing to open.
 */

export type AudioRouteKind =
  | "speaker"
  | "receiver"
  | "headphones"
  | "bluetooth"
  | "car"
  | "airplay"
  | "other";

export interface AudioRoute {
  /**
   * What to hand back to `select`.
   *
   * `"speaker"` and `"receiver"` are ours. Everything else is the accessory's
   * own port uid — and specifically its *input* port's, because that is what
   * picking it actually sets. The Swift side has the why.
   */
  id: string;
  /** The system's name for it: "AirPods Pro", "iPhone", "Speaker". */
  name: string;
  kind: AudioRouteKind;
}

/**
 * Written out rather than `extends NativeModule<Events>`.
 *
 * `expo-modules-core` exports `NativeModule` as `typeof ExpoGlobal.NativeModule`
 * — the constructor, not an instance — so extending it hands you the static
 * side and `addListener` is not on it. Three members is a small enough surface
 * to just declare.
 */
interface AudioRouteModule {
  outputs(): AudioRoute[];
  current(): AudioRoute | null;
  select(id: string): void;
  addListener(
    event: "onRouteChange",
    listener: (payload: { current: AudioRoute | null }) => void,
  ): EventSubscription;
}

const native = requireOptionalNativeModule<AudioRouteModule>("AudioRoute");

/** Whether this build can offer the choice at all. */
export const audioRouteAvailable = native !== null;

/**
 * Everything that could be picked right now.
 *
 * Empty rather than throwing where there is no module, so a caller can render
 * "nothing to choose" without asking first.
 */
export function audioRoutes(): AudioRoute[] {
  return native?.outputs() ?? [];
}

/** What is playing, or null when nothing is. */
export function currentAudioRoute(): AudioRoute | null {
  return native?.current() ?? null;
}

/**
 * Send the call somewhere else.
 *
 * Throws when the session is not in `playAndRecord` — which is the ordinary
 * state before a call has started, not a bug. Callers show the reason rather
 * than assuming success.
 */
export function selectAudioRoute(id: string): void {
  native?.select(id);
}

/**
 * Called whenever the route changes, including when nobody asked — a headset
 * unplugged, a car connected, an interruption ending on a different device.
 *
 * Returns a function that stops listening, and a no-op where there is no
 * module, so an effect can return it unconditionally.
 */
export function onAudioRouteChange(
  listener: (current: AudioRoute | null) => void,
): () => void {
  if (!native) return () => {};
  const subscription = native.addListener("onRouteChange", ({ current }) =>
    listener(current),
  );
  return () => subscription.remove();
}
