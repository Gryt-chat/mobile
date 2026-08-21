import { registerNativeVoicePlatform } from "@gryt/voice/native";
import { registerGlobals } from "react-native-webrtc";

/**
 * Point the voice engine at this phone, before anything can ask it to.
 *
 * Imported from `index.ts` ahead of `expo-router/entry`, which is the only
 * reason that file still exists — anything that has to run before React mounts
 * has to run before that import.
 *
 * **`registerGlobals()` is not optional and is not the same thing.** The
 * platform reaches `react-native-webrtc` through ordinary imports, so the
 * engine can build peer connections without it. What it cannot do is construct
 * a `MediaStream` in `ontrack`, which the engine does whenever the SFU sends a
 * track with no stream attached — that is a global rather than something the
 * platform hands over. Missing it does not fail here; it fails later, on a
 * particular kind of incoming track, which is the worst place to find out.
 *
 * Importing `@gryt/voice/native` registers the platform on its own. The call
 * is here anyway because the package asks for it explicitly, and because a
 * side-effect import with nothing next to it is the kind of line somebody
 * tidies away.
 */
registerGlobals();
registerNativeVoicePlatform();
