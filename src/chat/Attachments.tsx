import { useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, View } from "react-native";
import { Text, useTheme } from "@gryt/ui-native";
import { FileIcon } from "phosphor-react-native/src/icons/File";

import { attachmentSource, imageBox, isImage, readableSize, type Attachment } from "./files";
import { ImageLightbox } from "./ImageLightbox";

/**
 * What a message carries besides its words. This replaced a line of text reading
 * "1 attachment", which is a description of a picture where the picture fits.
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
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // Only what is ready; a file the server is still checking has nothing to open yet.
  const images = useMemo(() => attachments.filter((a) => isImage(a) && !a.processing && !a.refused), [attachments]);

  if (attachments.length === 0) return null;

  return (
    <View style={{ gap: theme.space(2), paddingTop: theme.space(2) }}>
      {attachments.map((attachment) =>
        attachment.processing ? (
          <Checking key={attachment.file_id} attachment={attachment} width={width} />
        ) : attachment.refused ? (
          <FileCard key={attachment.file_id} attachment={attachment} note="Couldn't be used" />
        ) : isImage(attachment) ? (
          <Picture
            key={attachment.file_id}
            attachment={attachment}
            host={host}
            width={width}
            onPress={() => setOpenIndex(images.indexOf(attachment))}
          />
        ) : (
          <FileCard key={attachment.file_id} attachment={attachment} />
        ),
      )}

      <ImageLightbox
        images={images.map((a) => ({ uri: attachmentSource(host, a), label: a.original_name ?? undefined }))}
        index={openIndex}
        onClose={() => setOpenIndex(null)}
      />
    </View>
  );
}

/**
 * One image, at the size the server says it is: the thumbnail in the row and the full
 * file in the lightbox. `has_thumbnail` says whether there is one to ask for.
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
        source={{ uri: attachmentSource(host, attachment, attachment.has_thumbnail) }}
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
 * A file the server's worker is still checking (GRYT-1669). It swaps for the real thing when
 * `chat:attachments` says it's done, so there is nothing to tap until then.
 */
function Checking({ attachment, width }: { attachment: Attachment; width: number }) {
  const theme = useTheme();
  const box = isImage(attachment) ? imageBox(attachment, width) : null;

  return (
    <View
      accessibilityLabel={`${attachment.original_name ?? "Attachment"}, still being checked`}
      style={{
        width: box?.width,
        height: box?.height,
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: box ? "center" : "flex-start",
        gap: theme.space(2),
        padding: theme.space(2),
        borderRadius: theme.radius.md,
        backgroundColor: theme.color.surfaceRaised,
        alignSelf: "flex-start",
        maxWidth: "100%",
      }}
    >
      <ActivityIndicator color={theme.color.muted} />
      <Text style={{ color: theme.color.muted, fontSize: 13 }}>Checking…</Text>
    </View>
  );
}

/**
 * Anything that is not a picture, and any picture that would not load. Named and sized
 * rather than drawn — a PDF as a broken image icon tells you less.
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
