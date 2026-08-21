import { useState } from "react";
import { Image, View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { AvatarFace } from "./AvatarFace";

/**
 * A person's avatar: the one they uploaded, or a generated face.
 *
 * The precedence is the desktop client's `resolveAvatarSrc`, deliberately —
 * uploaded wins, otherwise draw from the nickname, and never a letter tile.
 * Keeping it in one function means the rule cannot be half-applied when message
 * rows start showing avatars, which is the obvious next place this is needed:
 * `Message` already carries `sender_nickname` and `sender_avatar_file_id` and
 * nothing draws either yet.
 *
 * A broken upload falls back to the generated face rather than to a blank
 * circle. The web gets that from `<img onerror>`; here it is `onError` and a
 * piece of state, the same way `@gryt/ui-native`'s own Avatar does it.
 *
 * **A circular container with a neutral ground, and the face floating inside
 * it.** That is what `@gryt/ui`'s Avatar does on the desktop — `rounded-full`,
 * `bg-gryt-surface-raised`, `ring-1 ring-gryt-border` — and it is what makes an
 * avatar read as round there.
 *
 * The round shape has to come from the container, because **the face is not
 * round and its shape changes with the name**. Moods picks a face variant per
 * seed: "sivert" draws a squircle, "you" draws a wide oval, "bob" draws a tall
 * one. Nothing seeded is reliably a circle.
 *
 * Two wrong versions of this preceded the right one, and both are worth naming
 * so neither comes back. The first put a disc of the *face's own colour* behind
 * it, which is a coloured background where the design has none. The second drew
 * the bare face with no container at all, which is honest about the background
 * and not round.
 *
 * The clip does not crop anything: Moods draws inside a 100×100 viewBox and the
 * furthest point of any face is about 41 units from the centre, against an
 * inscribed circle of 50. Nine units of margin, which is why the desktop has
 * never needed to scale it either.
 */
export function PersonAvatar({
  name,
  source,
  size = 40,
}: {
  name: string | null | undefined;
  /** What they uploaded, if anything. */
  source?: string | null;
  size?: number;
}) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);

  /* One container for both cases, so an uploaded picture and a generated face
     are the same shape, the same size and on the same ground. */
  const circle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    overflow: "hidden" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: theme.color.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.color.border,
  };

  return (
    <View style={circle}>
      {source && !failed ? (
        <Image
          source={{ uri: source }}
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
