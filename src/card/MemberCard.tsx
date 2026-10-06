import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, View, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop, SvgXml } from "react-native-svg";
import { Text, useTheme } from "@gryt/ui-native";
import { blend, buttonLink, cardHeading, cardProfileOf, elapsed, gameIconUrl, seedFromId, type RichActivity } from "@gryt/ui/card-core";
import { openMessageLink } from "../chat/MessageMarkdown";

import { PersonAvatar } from "../avatar/PersonAvatar";
import { NameTag } from "../chat/NameTag";
import { bannerXml, cardLook, type Fill } from "./cardLook";
import { usePatternParts } from "./usePatternParts";

export interface MemberCardMember {
  serverUserId: string;
  nickname: string;
  status?: string;
  cardStyle?: unknown;
  bio?: unknown;
  pronouns?: unknown;
  statusLine?: unknown;
  avatarWorn?: string | null;
  richActivity?: RichActivity;
}

const STATUS_LABEL: Record<string, string> = { in_voice: "In Voice", online: "Online", afk: "AFK", offline: "Offline" };

/** A fill drawn edge to edge behind whatever sits on it. CSS angles: 0 is up, 90 is right. */
function FillLayer({ fill, id, width, height }: { fill: Fill; id: string; width: number; height: number }) {
  const rad = (fill.angle * Math.PI) / 180;
  const dx = Math.sin(rad) / 2;
  const dy = -Math.cos(rad) / 2;
  return (
    // Pixel sizes, not "100%": react-native-svg keeps a percentage from the first layout.
    <Svg style={{ position: "absolute", top: 0, left: 0 }} width={width} height={height}>
      <Defs>
        <LinearGradient id={id} x1={0.5 - dx} y1={0.5 - dy} x2={0.5 + dx} y2={0.5 + dy}>
          <Stop offset="0" stopColor={fill.from} />
          <Stop offset="1" stopColor={fill.to} />
        </LinearGradient>
      </Defs>
      <Rect width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

/** Transparent at `from` (0 to 1 down the box) into `colour` at the bottom. */
function FadeLayer({
  colour,
  from,
  via,
  id,
  width,
  height,
}: {
  colour: string;
  from: number;
  via?: number;
  id: string;
  width: number;
  height: number;
}) {
  return (
    <Svg style={{ position: "absolute", top: 0, left: 0 }} width={width} height={height}>
      <Defs>
        <LinearGradient id={id} x1={0} y1={0} x2={0} y2={1}>
          {[
            <Stop key="a" offset={from} stopColor={colour} stopOpacity={0} />,
            ...(via !== undefined ? [<Stop key="b" offset={via} stopColor={colour} stopOpacity={0.82} />] : []),
            <Stop key="c" offset="1" stopColor={colour} stopOpacity={1} />,
          ]}
        </LinearGradient>
      </Defs>
      <Rect width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * Somebody's member card, drawn natively from the same maths as the desktop one
 * (GRYT-1630). Everything comes in as props: it's shown in a modal context doesn't cross.
 */
export function MemberCard({
  member,
  owlHex,
  avatarUrl,
  bannerUrl,
  nameTag,
  customEmojis,
  channelName,
  width,
  onMessage,
  onMore,
}: {
  member: MemberCardMember;
  /** The owl's colour, the card's colour until they pick one. */
  owlHex: string;
  avatarUrl: string | null;
  /** A still for a video banner. */
  bannerUrl: string | null;
  nameTag?: string;
  customEmojis: ReadonlyMap<string, string>;
  /** The room they're in, when in voice. */
  channelName?: string;
  width: number;
  onMessage?: () => void;
  onMore?: () => void;
}) {
  const theme = useTheme();
  const profile = useMemo(() => cardProfileOf(member), [member]);
  const style = profile.cardStyle;
  const parts = usePatternParts(style, { nickname: member.nickname, worn: member.avatarWorn }, customEmojis);
  const look = useMemo(
    () =>
      cardLook(style, owlHex, {
        appearance: theme.appearance,
        seed: seedFromId(member.serverUserId),
        surface: theme.color.surface,
        ...parts,
      }),
    [style, owlHex, theme.appearance, theme.color.surface, member.serverUserId, parts],
  );
  const [cardHeight, setCardHeight] = useState(0);

  const status = member.status ?? "online";
  const game = member.richActivity && status !== "offline" ? member.richActivity : null;
  const line = !game && profile.statusLine ? profile.statusLine : null;
  const hasPattern = !!look.pattern || style.pattern === "gradient" || style.pattern === "dusk";
  const shortBanner = style.bannerSize === "short" || (!bannerUrl && !hasPattern);
  const bannerHeight = shortBanner ? 96 : 164;

  const text = look.text ?? theme.color.text;
  const muted = look.muted ?? theme.color.muted;
  const ring =
    status === "in_voice" ? theme.color.accent : status === "online" ? theme.color.success : status === "afk" ? theme.color.warning : "transparent";
  // While a game plays the name's backdrop fades into the band colour, and on a
  // banner-coloured card the name and status take the band's ink (desktop's .has-band).
  const under = game && look.band ? look.band.colour : theme.color.surface;
  const overInk = game && look.band?.ink ? look.band.ink : null;
  // The band's heading: the card's accent most of the way to the ink, as desktop mixes it.
  const heading = blend(text.slice(0, 7), look.accent, 0.75);

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setCardHeight(e.nativeEvent.layout.height)}
      style={{
        width,
        borderRadius: theme.radius.xl,
        overflow: "hidden",
        backgroundColor: theme.color.surface,
        borderWidth: look.full ? 0 : 1,
        borderColor: theme.color.border,
      }}
    >
      {look.card && cardHeight > 0 ? <FillLayer fill={look.card} id="card" width={width} height={cardHeight} /> : null}
      {look.full && look.patternOnCard && look.pattern && cardHeight > 0 ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0 }}>
          <SvgXml xml={look.pattern} width={width} height={cardHeight} />
        </View>
      ) : null}

      <View style={{ height: bannerHeight, overflow: "hidden" }}>
        {/* Over a card coloured whole with the pattern on the card, the banner shows only a picture. */}
        {!(look.full && look.patternOnCard) ? (
          <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0 }}>
            <SvgXml xml={bannerXml(look, width, bannerHeight, !bannerUrl)} width={width} height={bannerHeight} />
          </View>
        ) : null}
        {bannerUrl ? (
          <Image source={{ uri: bannerUrl }} resizeMode="cover" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
        ) : null}
        {bannerUrl && look.patternInFront && look.pattern ? (
          <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0 }}>
            <SvgXml xml={look.pattern} width={width} height={bannerHeight} />
          </View>
        ) : null}

        {/* Behind the name, so it reads on any banner. A card coloured whole fades instead. */}
        {!look.full ? (
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 112 }}>
            <FadeLayer colour={under} from={0} via={0.55} id="over" width={width} height={112} />
          </View>
        ) : null}

        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 12,
            paddingHorizontal: 14,
            paddingBottom: 12,
          }}
        >
          <View style={{ width: 64, height: 64, borderRadius: 32, padding: 3, backgroundColor: ring }}>
            <View style={{ flex: 1, borderRadius: 29, borderWidth: 2, borderColor: theme.color.surface, overflow: "hidden" }}>
              <PersonAvatar name={member.nickname} source={avatarUrl} size={54} variant="bare" />
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={2} style={{ color: overInk ?? text, fontSize: 21, fontWeight: "800", lineHeight: 24 }}>
              {member.nickname}
              {nameTag ? <NameTag tag={nameTag} /> : null}
            </Text>
            <Text style={{ fontSize: 12.5, color: overInk ? `${overInk.slice(0, 7)}d1` : look.full ? text : status === "offline" ? muted : ring }}>
              {STATUS_LABEL[status] ?? "Online"}
              {status === "in_voice" && channelName ? <Text style={{ color: muted }}>{` · ${channelName}`}</Text> : null}
            </Text>
          </View>
        </View>
      </View>

      {game ? (
        <GameBand game={game} pip={look.pip ?? text} button={look.button} heading={heading} line={look.full ? null : look.band ? blend(theme.color.border, look.accent, 0.32) : null} text={text} muted={muted} />
      ) : line ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: heading }}>Status</Text>
          <Text style={{ fontSize: 17, fontWeight: "700", color: text, lineHeight: 22 }}>{line}</Text>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: 12 }}>
        {profile.pronouns ? <Text style={{ fontSize: 13, color: muted }}>{profile.pronouns}</Text> : null}
        {profile.bio ? <Text style={{ fontSize: 13.5, color: text, lineHeight: 19 }}>{profile.bio}</Text> : null}
        {onMessage || onMore ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            {onMessage ? <CardButton label="Message" onPress={onMessage} ink={text} tinted={look.full} grow /> : null}
            {onMore ? <CardButton label="More" onPress={onMore} ink={text} tinted={look.full} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** A button in the card's own ink, so it sits on any card colour the way desktop's do. */
function CardButton({
  label,
  onPress,
  ink,
  tinted,
  grow = false,
}: {
  label: string;
  onPress: () => void;
  ink: string;
  /** On a card coloured whole: the ink at low strength rather than the theme's raised surface. */
  tinted: boolean;
  grow?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexGrow: grow ? 1 : 0,
        height: 40,
        paddingHorizontal: 16,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: tinted ? `${ink}3d` : theme.color.border,
        backgroundColor: tinted ? `${ink}${pressed ? "33" : "1f"}` : pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
      })}
    >
      <Text style={{ color: ink, fontSize: 14, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

/** More seats than this and the pips would be a ruler, so only the words show. */
const MAX_PIPS = 16;

/** A game's Rich Presence, between the banner and the rest of the card. Never filled: on
    every card it sits on the card's own colour, with a line under it. */
function GameBand({
  game,
  pip,
  button,
  heading,
  line,
  text,
  muted,
}: {
  game: RichActivity;
  pip: string;
  button: { bg: string; fg: string };
  heading: string;
  /** The rule under the band, or null on a card coloured whole, which has none. */
  line: string | null;
  text: string;
  muted: string;
}) {
  const theme = useTheme();
  const [now, setNow] = useState(() => Date.now());
  const [iconFailed, setIconFailed] = useState(false);
  useEffect(() => {
    if (game.startedAt === undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [game.startedAt]);

  const time = elapsed(game.startedAt, now);
  const icon = gameIconUrl((game as RichActivity & { appId?: string }).appId);
  const party = game.party;
  const links = (game.buttons ?? [])
    .map((b) => ({ label: b.label, link: buttonLink(b.url) }))
    .filter((b): b is { label: string; link: { href: string; host: string } } => b.link !== null);

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 10,
        borderBottomWidth: line ? 1 : 0,
        borderBottomColor: line ?? "transparent",
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: heading }}>{cardHeading(game)}</Text>
        {time ? <Text mono style={{ fontSize: 22, fontWeight: "600", color: text }}>{time}</Text> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: text }}>{game.name}</Text>
          {game.details ? <Text style={{ fontSize: 12.5, color: text }}>{game.details}</Text> : null}
          {game.state ? <Text style={{ fontSize: 12.5, color: muted }}>{game.state}</Text> : null}
        </View>
        {icon && !iconFailed ? (
          <Image source={{ uri: icon }} onError={() => setIconFailed(true)} style={{ width: 56, height: 56, borderRadius: 13 }} />
        ) : null}
      </View>
      {party ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {party.max && party.max <= MAX_PIPS ? (
            <View style={{ flexDirection: "row", gap: 3 }}>
              {Array.from({ length: party.max }, (_, i) => (
                <View
                  key={i}
                  style={{ width: 14, height: 6, borderRadius: 3, backgroundColor: i < party.size ? pip : theme.color.border }}
                />
              ))}
            </View>
          ) : null}
          <Text style={{ fontSize: 12, color: muted }}>
            {party.max ? `${party.size} of ${party.max} in party` : `${party.size} in party`}
          </Text>
        </View>
      ) : null}
      {links.map(({ label, link }) => (
        <Pressable
          key={link.href}
          onPress={() => void openMessageLink(link.href)}
          accessibilityRole="link"
          style={({ pressed }) => ({
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: theme.radius.sm,
            backgroundColor: button.bg,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: button.fg }}>{label}</Text>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, color: button.fg, opacity: 0.8 }}>
            {link.host}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
