import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";

import type { Picked } from "./staging";

/** Whether there's an image to offer. Asking doesn't show iOS's paste prompt; reading it does. */
export async function clipboardHasImage(): Promise<boolean> {
  try {
    return await Clipboard.hasImageAsync();
  } catch {
    return false;
  }
}

/** The clipboard's image as a file the upload can read, or null when there isn't one any more. */
export async function pastedImage(now = Date.now()): Promise<Picked | null> {
  const image = await Clipboard.getImageAsync({ format: "png" });
  const base64 = image?.data.replace(/^data:image\/\w+;base64,/, "");
  if (!image || !base64) return null;
  const file = new File(Paths.cache, `pasted-${now}.png`);
  file.create({ overwrite: true });
  file.write(base64, { encoding: "base64" });
  return { uri: file.uri, mime: "image/png", name: "pasted.png", width: image.size.width, height: image.size.height };
}
