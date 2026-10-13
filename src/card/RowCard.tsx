import { useMemo, useState } from "react";
import { Image, View, type LayoutChangeEvent } from "react-native";
import { SvgXml } from "react-native-svg";
import { useTheme } from "@gryt/ui-native";
import { cardProfileOf, seedFromId } from "@gryt/ui/card-core";

import { useCustomEmojis } from "../chat/CustomEmojiProvider";
import { attachmentUrl } from "../chat/files";
import type { Member } from "../connection/types";
import { bannerXml, cardLook } from "./cardLook";
import { owlColour } from "./owlColour";
import { usePatternParts } from "./usePatternParts";

/* Darker where the name is, so it reads on any card. */
const SCRIM =
  "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='10' preserveAspectRatio='none' viewBox='0 0 100 10'>" +
  "<defs><linearGradient id='s' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#0e0f14' stop-opacity='0.62'/>" +
  "<stop offset='0.75' stop-color='#0e0f14' stop-opacity='0.12'/></linearGradient></defs><rect width='100' height='10' fill='url(#s)'/></svg>";

/**
 * A member's card as the background of their row in the members drawer (GRYT-1726):
 * their banner picture, or the card's colour and pattern from the same `cardLook` the card draws.
 */
export function RowCard({ member, host, dim }: { member: Member; host: string | null; dim: boolean }) {
  const theme = useTheme();
  const customEmojis = useCustomEmojis();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const profile = useMemo(() => cardProfileOf(member), [member]);
  const owlHex = owlColour(member.nickname, member.avatarWorn);
  const parts = usePatternParts(profile.cardStyle, { nickname: member.nickname, worn: member.avatarWorn }, customEmojis);
  const look = useMemo(
    () =>
      cardLook(profile.cardStyle, owlHex, {
        appearance: theme.appearance,
        seed: seedFromId(member.serverUserId),
        surface: theme.color.surface,
        ...parts,
      }),
    [profile.cardStyle, owlHex, theme.appearance, theme.color.surface, member.serverUserId, parts],
  );
  // A still for a video banner, the same as the card's poster.
  const picture = member.bannerFileId && host ? attachmentUrl(host, member.bannerFileId, member.bannerVideo === true) : null;
  // A card coloured whole draws its own colour here, with the pattern if it covers the card.
  const fill = look.full && look.card ? { ...look, banner: look.card, full: false } : look;

  return (
    <View
      pointerEvents="none"
      onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12, overflow: "hidden", opacity: dim ? 0.45 : 1 }}
    >
      {size ? (
        picture ? (
          <Image source={{ uri: picture }} resizeMode="cover" style={{ width: size.w, height: size.h }} />
        ) : (
          <SvgXml xml={bannerXml(fill, Math.round(size.w), Math.round(size.h), !look.full || look.patternOnCard)} width={size.w} height={size.h} />
        )
      ) : null}
      {size ? (
        <View style={{ position: "absolute", top: 0, left: 0 }}>
          <SvgXml xml={SCRIM} width={size.w} height={size.h} />
        </View>
      ) : null}
    </View>
  );
}
