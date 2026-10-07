import { requireOptionalNativeModule } from "expo-modules-core";

/* Null on Android, in tests and on builds from before GRYT-1688, which then show the relay's fixed text. */
const native = requireOptionalNativeModule<{ setKeys(keys: Record<string, string>): boolean }>("PushPreview");

/** Every server's preview key, by the tag the relay puts on its pushes, for the notification extension. */
export function shareKeysWithExtension(keysByTag: Record<string, string>): boolean {
  return native?.setKeys(keysByTag) ?? false;
}
