import { Platform, Share } from "react-native";
import { Directory, File, Paths } from "expo-file-system";

/**
 * Hands an image to the OS share sheet. On iOS the actual bytes go along, so the sheet's
 * own "Save Image" does the saving — no media-library module needed for that.
 */
export async function shareImage(uri: string, label?: string): Promise<void> {
  if (Platform.OS === "ios" && /^https?:\/\//.test(uri)) {
    try {
      const file = await File.downloadFileAsync(uri, new Directory(Paths.cache), { idempotent: true });
      await Share.share({ url: file.uri });
      return;
    } catch {
      // Falls through to sharing the link — a failed download should not block sharing.
    }
  }
  await Share.share({ message: uri, url: uri, title: label });
}
