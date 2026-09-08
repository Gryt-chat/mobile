import { registerNativeVoicePlatform } from "@gryt/voice/native";
import { registerGlobals } from "react-native-webrtc";

/**
 * Point the voice engine at this phone, before anything can ask it to. **`registerGlobals()`
 * is not optional and is not the same thing**: without it the engine cannot construct a
 * `MediaStream` in `ontrack`, which fails later on a particular kind of incoming track.
 */
registerGlobals();
registerNativeVoicePlatform();
