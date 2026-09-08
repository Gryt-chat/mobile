import { useState } from "react";
import { Image, View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { AvatarFace } from "./AvatarFace";

/**
 * A person's avatar, in the desktop's `resolveAvatarSrc` precedence. **Everything goes
 * through here.** **The round shape comes from the container**, since the owl is square.
 */
export function PersonAvatar({
  name,
  source,
  size = 40,
  variant = "framed",
}: {
  name: string | null | undefined;
  /** What they uploaded, if anything. */
  source?: string | null;
  size?: number;
  /** `framed` on a page, `bare` on a surface that is its own ground. */
  variant?: "framed" | "bare";
}) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);

  /* Re-tried when the uri changes, so a new picture is not stuck behind a failure.
     Normalised to null on both sides, or the comparison sets state forever. */
  const uri = source ?? null;
  const [attempted, setAttempted] = useState<string | null>(uri);
  if (uri !== attempted) {
    setAttempted(uri);
    if (failed) setFailed(false);
  }

  const uploaded = uri !== null && !failed;

  /* One container for both cases, so an uploaded picture and a generated owl
     are the same shape, the same size and on the same ground. */
  const circle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    overflow: "hidden" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    ...(variant === "framed"
      ? {
          backgroundColor: theme.color.surfaceRaised,
          borderWidth: 1,
          borderColor: theme.color.border,
        }
      : null),
  };

  return (
    <View style={circle}>
      {uploaded ? (
        <Image
          source={{ uri }}
          onError={() => setFailed(true)}
          accessibilityLabel={name ?? undefined}
          style={{ width: size, height: size }}
        />
      ) : (
        <AvatarFace name={name} size={size} />
      )}
    </View>
  );
}
