import { Image, Pressable, ScrollView, View } from "react-native";
import { Spinner, Text, useTheme } from "@gryt/ui-native";
import { XIcon } from "phosphor-react-native/src/icons/X";
import { FileIcon } from "phosphor-react-native/src/icons/File";

import type { Picked } from "./staging";

/**
 * What is about to be sent, above the field. **Staged rather than uploaded on pick**, so
 * cancelling costs nothing and leaves nothing on the server. The strip greys out as one
 * thing: four progress bars for one action is four things to read.
 */
export function StagedAttachments({
  files,
  busy,
  onRemove,
}: {
  files: Picked[];
  /** Uploading. Removal is off, because the request is already going. */
  busy: boolean;
  onRemove: (index: number) => void;
}) {
  const theme = useTheme();
  if (files.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      style={{ borderBottomWidth: 1, borderBottomColor: theme.color.border }}
      contentContainerStyle={{
        gap: theme.space(2),
        paddingHorizontal: theme.space(3),
        paddingVertical: theme.space(2),
      }}
    >
      {files.map((file, index) => (
        <View key={`${file.uri}:${index}`} style={{ opacity: busy ? 0.5 : 1 }}>
          {file.mime.startsWith("image/") ? (
            <Image
              source={{ uri: file.uri }}
              style={{
                width: 56,
                height: 56,
                borderRadius: theme.radius.md,
                backgroundColor: theme.color.surface,
              }}
              /* Cover, not contain: this is a thumbnail of what is going, not a
                 preview to judge the framing by. */
              resizeMode="cover"
              accessibilityLabel={file.name}
            />
          ) : (
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: theme.radius.md,
                backgroundColor: theme.color.surface,
                borderWidth: 1,
                borderColor: theme.color.border,
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                paddingHorizontal: 4,
              }}
            >
              <FileIcon size={18} color={theme.color.muted} weight="fill" />
              <Text
                numberOfLines={1}
                style={{ color: theme.color.muted, fontSize: 9 }}
              >
                {file.name}
              </Text>
            </View>
          )}

          {busy ? (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Spinner size="small" color={theme.color.text} />
            </View>
          ) : (
            <Pressable
              onPress={() => onRemove(index)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${file.name}`}
              style={({ pressed }) => ({
                position: "absolute",
                top: -6,
                right: -6,
                width: 22,
                height: 22,
                borderRadius: 11,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.color.surfaceRaised,
                borderWidth: 1,
                borderColor: theme.color.border,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <XIcon size={12} color={theme.color.text} weight="bold" />
            </Pressable>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
