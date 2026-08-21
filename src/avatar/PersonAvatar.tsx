import { useState } from "react";
import { Image, View } from "react-native";

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
 * **Always the disc form.** `AvatarFace` without it is a head-shaped
 * silhouette with ragged edges, which is what a person is *on* a surface — and
 * this is drawn beside round things every time it is used: a 72pt one at the
 * top of the You page, a 40pt one against a message. The tab bar and the voice
 * tiles both asked for the disc explicitly and this did not, so the profile
 * and the chat were the two places showing a cut-out head where everything
 * else showed a face in a circle.
 *
 * Not a variant of that Avatar, because that one takes `source` as a URI and
 * React Native cannot decode the SVG a generated face is. See `AvatarFace`.
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
  const [failed, setFailed] = useState(false);

  if (source && !failed) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
        }}
      >
        <Image
          source={{ uri: source }}
          onError={() => setFailed(true)}
          accessibilityLabel={name ?? undefined}
          style={{ width: size, height: size }}
        />
      </View>
    );
  }

  return <AvatarFace name={name} size={size} disc />;
}
