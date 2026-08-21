/* The router registers the root component, so there is no
 * `registerRootComponent(App)` here any more and no `App.tsx` for it to
 * register. Everything that file held is `app/_layout.tsx` now.
 *
 * This file stays rather than pointing `main` straight at `expo-router/entry`,
 * because anything that has to run before React mounts has to run before that
 * import — and the import has to be last for the same reason.
 *
 * `./src/voice/register` is the first thing that has needed it: it calls
 * `registerGlobals()` from `react-native-webrtc` and points the voice engine at
 * this phone. Module imports are evaluated in source order, so being above the
 * router is what makes it run first.
 */
import "./src/voice/register";
import "expo-router/entry";
