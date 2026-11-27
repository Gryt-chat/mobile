import { requireOptionalNativeModule } from "expo-modules-core";

const native = requireOptionalNativeModule<{ start: () => void; stop: () => void }>("CallService");

/** The Android foreground service that keeps the microphone running in the background. No-op elsewhere. */
export const callService = { start: () => native?.start(), stop: () => native?.stop() };
