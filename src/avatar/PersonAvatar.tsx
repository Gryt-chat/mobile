import { useState } from "react";
import { Image, View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { AvatarFace } from "./AvatarFace";

/**
 * A person's avatar: the one they uploaded, or a generated face.
 *
 * The precedence is the desktop client's `resolveAvatarSrc`, deliberately —
 * uploaded wins, otherwise draw from the nickname, and never a letter tile.
 * Keeping it in one function is what stops the rule being half-applied, which
 * is why the voice tile goes through here too rather than branching on a uri of
 * its own: a tile that fell back differently from a message row would be two
 * answers to what one person looks like.
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
 *
 * **`variant="bare"` drops the container and draws the disc face instead.** For
 * a surface that is already the ground and already round enough — the voice
 * tile, which is a large rounded rectangle in `surfaceRaised` with the face
 * floating in the middle of it. Framed there would be a circle of the same
 * colour as the tile with a hairline around it, which is a second edge inside
 * the first.
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
     stuck on the generated face because the previous one failed to load.
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

  /* One container for both cases, so an uploaded picture and a generated face
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
        /* The disc form only where there is no container to be round for it.
           Raw Moods is a head-shaped silhouette with ragged edges, which is
           right inside a circle and wrong floating on a tile. */
        <AvatarFace name={name} size={size} disc={variant === "bare"} />
      )}
    </View>
  );
}
