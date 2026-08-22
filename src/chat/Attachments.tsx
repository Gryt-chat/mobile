import { useState } from "react";
import { Image, Modal, Pressable, View } from "react-native";
import { Text } from "../ui/Text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@gryt/ui-native";
import { FileIcon } from "phosphor-react-native/src/icons/File";
import { XIcon } from "phosphor-react-native/src/icons/X";

import { attachmentUrl, imageBox, isImage, readableSize, type Attachment } from "./files";

/**
 * What a message carries besides its words.
 *
 * This replaced a line of text reading "1 attachment", which is a description
 * of a picture where the picture would have fitted.
 */
export function Attachments({
  attachments,
  host,
  width,
}: {
  attachments: Attachment[];
  host: string;
  /** Room the row has, so an image can be sized before it loads. */
  width: number;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState<Attachment | null>(null);

  if (attachments.length === 0) return null;

  return (
    <View style={{ gap: theme.space(2), paddingTop: theme.space(2) }}>
      {attachments.map((attachment) =>
        isImage(attachment) ? (
          <Picture
            key={attachment.file_id}
            attachment={attachment}
            host={host}
            width={width}
            onPress={() => setOpen(attachment)}
          />
        ) : (
          <FileCard key={attachment.file_id} attachment={attachment} />
        ),
      )}

      <Lightbox attachment={open} host={host} onClose={() => setOpen(null)} />
    </View>
  );
}

/**
 * One image, at the size the server says it is.
 *
 * The thumbnail in the row and the full file in the lightbox — a chat scrolling
 * past twenty photos should not be pulling twenty originals down a phone
 * connection. `has_thumbnail` says whether there is one to ask for; without it
 * the original is all there is.
 */
function Picture({
  attachment,
  host,
  width,
  onPress,
}: {
  attachment: Attachment;
  host: string;
  width: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  const box = imageBox(attachment, width);

  if (failed) return <FileCard attachment={attachment} note="Could not load" />;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={attachment.original_name ?? "Image"}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Image
        source={{ uri: attachmentUrl(host, attachment.file_id, attachment.has_thumbnail) }}
        onError={() => setFailed(true)}
        style={{
          width: box.width,
          height: box.height,
          borderRadius: theme.radius.md,
          backgroundColor: theme.color.surfaceRaised,
        }}
        accessibilityIgnoresInvertColors
      />
    </Pressable>
  );
}

/**
 * Anything that is not a picture, and any picture that would not load.
 *
 * Named and sized rather than drawn. A PDF rendered as a broken image icon
 * tells you less than a row saying it is a PDF.
 */
function FileCard({ attachment, note }: { attachment: Attachment; note?: string }) {
  const theme = useTheme();
  const size = readableSize(attachment.size);
  const detail = [note, size].filter(Boolean).join(" · ");

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.space(2),
        padding: theme.space(2),
        borderRadius: theme.radius.md,
        backgroundColor: theme.color.surfaceRaised,
        alignSelf: "flex-start",
        maxWidth: "100%",
      }}
    >
      <FileIcon size={20} color={theme.color.muted} />
      <View style={{ flexShrink: 1 }}>
        <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 14 }}>
          {attachment.original_name ?? "Attachment"}
        </Text>
        {detail ? (
          <Text style={{ color: theme.color.muted, fontSize: 12 }}>{detail}</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A picture, full size, over everything.
 *
 * `Modal` rather than the app's `Sheet`, because this is not a sheet: it covers
 * the screen completely, has no snap points and nothing behind it to peek at.
 * It also has to sit above the tab bar, which a sheet would fight with.
 */
function Lightbox({
  attachment,
  host,
  onClose,
}: {
  attachment: Attachment | null;
  host: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={attachment !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      /* Android's back button, which `onRequestClose` is for, and the reason a
         Modal is worth the weight over a positioned View. */
    >
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close image"
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.94)", justifyContent: "center" }}
      >
        {attachment ? (
          <Image
            source={{ uri: attachmentUrl(host, attachment.file_id) }}
            resizeMode="contain"
            style={{ width: "100%", height: "100%" }}
            accessibilityLabel={attachment.original_name ?? "Image"}
            accessibilityIgnoresInvertColors
          />
        ) : null}

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
          style={{
            position: "absolute",
            top: insets.top + 8,
            right: 16,
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <XIcon size={20} color="#fff" weight="bold" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
