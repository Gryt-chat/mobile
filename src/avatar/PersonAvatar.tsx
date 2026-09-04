import { useState } from "react";
import { Image, View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { AvatarFace } from "./AvatarFace";

/**
 * A person's avatar: the one they uploaded, or their generated owl. The
 * precedence is the desktop's `resolveAvatarSrc` — uploaded wins, otherwise
 * draw from the nickname, never a letter tile.
 *
 * **Everything goes through here, the voice tile included.** A tile that fell
 * back differently from a message row would be two answers to what one person
 * looks like. A broken upload falls back to the owl, not a blank circle.
 *
 * **The round shape comes from the container**, because the owl is drawn square
 * and edge to edge on purpose. The clip only takes background — the owl's body
 * is centred and its wings fall away exactly where an inscribed circle cuts.
 *
 * **`variant="bare"` drops the frame's ground and border**, for a surface that
 * is already the ground. Still clipped round; only the chrome goes.
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

  /* Re-tried when the uri changes, so a member who uploads a new picture is not
     stuck on the generated owl because the previous one failed to load.
     Adjusting state during render rather than in an effect, which is what React
     documents for this — an effect would draw one frame of the wrong thing.

     Normalised to null on both sides on purpose: `source` is optional, so
     comparing a bare `undefined` against a `null` initial state is true every
     render and sets state forever. */
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
