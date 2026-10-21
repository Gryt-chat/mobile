import { useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, View } from "react-native";
import { Text, useTheme, useToast } from "@gryt/ui-native";
import { FileIcon } from "phosphor-react-native/src/icons/File";
import { ShareIcon } from "phosphor-react-native/src/icons/Share";
import { Gallery } from "react-native-motion-lightbox";

import { attachmentSource, imageBox, isImage, readableSize, type Attachment } from "./files";
import { ChromeButton, ImageLightbox } from "./ImageLightbox";
import { shareImage } from "./imageExport";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * What a message carries besides its words. This replaced a line of text reading
 * "1 attachment", which is a description of a picture where the picture fits.
 */
export function Attachments({
  attachments,
  host,
  width,
  title,
  flush,
}: {
  attachments: Attachment[];
  /** Inside a bubble the bubble spaces things, so no gap of its own above. */
  flush?: boolean;
  host: string;
  /** Who sent it and when, for the lightbox's top bar. */
  title?: { name: string; detail?: string };
  /** Room the row has, so an image can be sized before it loads. */
  width: number;
}) {
  const theme = useTheme();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // Only what is ready; a file the server is still checking has nothing to open yet.
  const images = useMemo(() => attachments.filter((a) => isImage(a) && !a.processing && !a.refused), [attachments]);

  // Two or more pictures go in one gallery, where the first of them would be (GRYT-1839).
  const gallery = images.length >= 2;

  if (attachments.length === 0) return null;

  return (
    <View style={{ gap: theme.space(2), paddingTop: flush ? 0 : theme.space(2) }}>
      {attachments.map((attachment) => {
        if (attachment.processing) return <Checking key={attachment.file_id} attachment={attachment} width={width} />;
        if (attachment.refused) return <FileCard key={attachment.file_id} attachment={attachment} note="Couldn't be used" />;
        if (!isImage(attachment)) return <FileCard key={attachment.file_id} attachment={attachment} />;
        if (gallery) {
          return attachment === images[0] ? (
            <MessageGallery key="gallery" images={images} host={host} width={width} title={title} />
          ) : null;
        }
        return (
          <Picture
            key={attachment.file_id}
            attachment={attachment}
            host={host}
            width={width}
            onPress={() => setOpenIndex(images.indexOf(attachment))}
          />
        );
      })}

      <ImageLightbox
        images={images.map((a) => ({ uri: attachmentSource(host, a), label: a.original_name ?? undefined }))}
        index={openIndex}
        title={title}
        onClose={() => setOpenIndex(null)}
      />
    </View>
  );
}

/** The desktop's shape: the first picture's, kept between 4:5 and 16:9. */
const ASPECT: [number, number] = [4 / 5, 16 / 9];

/**
 * Several pictures, one at a time: swipe between them, and a tap opens the package's lightbox
 * out of the picture. The gallery shows the thumbnail; the lightbox loads the full file.
 */
function MessageGallery({
  images,
  host,
  width,
  title,
}: {
  images: Attachment[];
  host: string;
  width: number;
  title?: { name: string; detail?: string };
}) {
  const theme = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const first = images[0];
  const ratio = first.width && first.height ? first.width / first.height : 1;
  const items = useMemo(
    () =>
      images.map((a) => ({
        kind: "image" as const,
        src: attachmentSource(host, a),
        thumb: a.has_thumbnail ? attachmentSource(host, a, true) : undefined,
        width: a.width ?? undefined,
        height: a.height ?? undefined,
        alt: a.original_name ?? undefined,
      })),
    [images, host],
  );
  const share = (src: string, name?: string) =>
    shareImage(src, name).catch(() => toast.show({ title: "Could not share the image", severity: "error" }));

  return (
    <Gallery
      items={items}
      aspect={Math.min(Math.max(ratio, ASPECT[0]), ASPECT[1])}
      peek={28}
      gap={6}
      radius={theme.radius.md}
      colors={{ slide: theme.color.surfaceRaised }}
      insets={{ top: insets.top, bottom: insets.bottom }}
      // Not a caption: the gallery draws that under itself in the message as well.
      title={() => [title?.name, title?.detail].filter(Boolean).join(" · ")}
      toolbar={(item) => (
        <ChromeButton onPress={() => void share(item.src, item.alt)} label="Share">
          <ShareIcon size={20} color="#fff" weight="bold" />
        </ChromeButton>
      )}
      style={{ width: Math.min(width, 420) }}
    />
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
