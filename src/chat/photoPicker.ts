import * as ImagePicker from "expo-image-picker";

/**
 * Asks the photo picker for a JPEG where the photo is an iPhone HEIC. The server can't
 * decode HEVC, so a HEIC upload was refused as "corrupt or unreadable".
 */
export const COMPATIBLE_PHOTOS = {
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};
