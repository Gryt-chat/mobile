import { registerNativeVoicePlatform } from "@gryt/voice/native";
import { registerGlobals } from "react-native-webrtc";

/**
 * Point the voice engine at this phone before anything asks it to. `registerGlobals()` is
 * not optional: without it the engine cannot build a `MediaStream` in `ontrack`.
 */
registerGlobals();
registerNativeVoicePlatform();
