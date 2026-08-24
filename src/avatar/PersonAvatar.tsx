import { useState } from "react";
import { Image, View } from "react-native";
import { useTheme } from "@gryt/ui-native";

import { AvatarFace } from "./AvatarFace";

/**
 * A person's avatar: the one they uploaded, or their generated owl.
 *
 * The precedence is the desktop client's `resolveAvatarSrc`, deliberately —
 * uploaded wins, otherwise draw from the nickname, and never a letter tile.
 * Keeping it in one function is what stops the rule being half-applied, which
 * is why the voice tile goes through here too rather than branching on a uri of
 * its own: a tile that fell back differently from a message row would be two
 * answers to what one person looks like.
 *
 * A broken upload falls back to the owl rather than to a blank circle. The web
 * gets that from `<img onerror>`; here it is `onError` and a piece of state, the
 * same way `@gryt/ui-native`'s own Avatar does it.
 *
 * **A circular container, with the avatar clipped to it.** That is what
 * `@gryt/ui`'s Avatar does on the desktop — `rounded-full`, `overflow-hidden`,
 * `bg-gryt-surface-raised`, `ring-1 ring-gryt-border` — and it is what makes an
 * avatar read as round there.
 *
 * The round shape has to come from the container, because the owl is drawn
 * square and edge to edge. It is drawn that way on purpose: a caller that wants
 * a rounded rectangle or a full-bleed tile gets one, and the caller that wants a
 * circle clips. `@gryt/owl` will draw its own rounded corners through
 * `cornerRadius`, and using that here would put a second clip inside this one
 * for no gain.
 *
 * Two earlier versions of this are worth naming. The first put a disc of the
 * face's own colour behind a transparent Moods head, because clipping a
 * silhouette to a circle leaves ragged edges rather than a disc. The second drew
 * the bare face with no container at all, which was honest about the background
 * and not round. Neither problem exists now — the owl fills the frame and brings
 * its own background — which is why `AvatarFace` no longer has a `disc` form.
 *
 * The circular clip only takes background. The owl is drawn inside a 1024
 * viewBox with its body centred and its wings falling away at the bottom
 * corners, which is exactly where an inscribed circle cuts.
 *
 * **`variant="bare"` drops the frame's ground and border.** For a surface that
 * is already the ground — the voice tile, which is a large rounded rectangle in
 * `surfaceRaised` with the avatar in the middle of it. Framed there would be a
 * hairline circle inside the tile's own edge, which is a second edge inside the
 * first. It is still clipped round; only the chrome goes.
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
