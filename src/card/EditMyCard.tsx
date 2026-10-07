import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Image, Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Button, Slider, Text, TextField, useTheme, useToast } from "@gryt/ui-native";
import {
  BUILTIN_CARD_STYLES,
  cardPattern,
  cardProfileOf,
  cardVars,
  DEFAULT_EMOJI,
  isTunable,
  PATTERN_FADES,
  seedFromId,
  TUNING,
  type PatternFade,
  randomCardStyle,
  type CardProfile,
  type CardStyle,
} from "@gryt/ui/card-core";

import { useCustomEmojis } from "../chat/CustomEmojiProvider";
import { EmojiPicker } from "../chat/EmojiPicker";
import { attachmentUrl } from "../chat/files";
import { useShell } from "../shell/ShellContext";
import { mayUploadBanner, mayUploadVideoBanner, sendBanner, type PickedBanner } from "./bannerUpload";
import { useConnections, useServerConnection } from "../connection/ConnectionsProvider";
import { useMembers } from "../connection/MembersProvider";
import { cardPayload, hexFrom, LIMITS, patternGroups, sameCard, styleFromLink, SWATCHES } from "./cardDraft";
import { MemberCard } from "./MemberCard";
import { owlColour } from "./owlColour";

/**
 * Edit my card on the phone (GRYT-1630). A sheet over the You page rather than a route:
 * React Native's own `Modal`, so the connection and member contexts reach it.
 */
export function EditMyCard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useTheme();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const { me, socket } = useServerConnection();
  const { byHost } = useConnections();
  const { all, avatarUrlFor, nameTags } = useMembers();
  const { server } = useShell();
  const customEmojis = useCustomEmojis();

  const mine = me ? all.find((m) => m.serverUserId === me.serverUserId) : undefined;
  const saved = useMemo<CardProfile>(() => cardProfileOf(mine ?? {}), [mine]);
  const [draft, setDraft] = useState<CardProfile>(saved);
  const [link, setLink] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  // A picked picture, null to remove the one you have, undefined for no change.
  const [banner, setBanner] = useState<PickedBanner | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  /* Every server you're connected to that takes a banner from you. Uploads are trusted-only,
     so this is often none, and the section isn't offered at all then. */
  const bannerHosts = Object.entries(byHost)
    .filter(([, c]) => c.online && c.socket && c.state.status === "ready" && mayUploadBanner(c.state.details))
    .map(([host]) => host);
  // The ones that also make a playable banner from a video, as desktop's videoBannerHosts.
  const videoBannerHosts = bannerHosts.filter((host) => {
    const c = byHost[host];
    return c.state.status === "ready" && mayUploadVideoBanner(c.state.details);
  });

  /* What the preview draws: a still, and a video over it. A video you have shows its poster
     until it plays; a video just picked has no poster yet and plays straight away. */
  const current = mine?.bannerFileId && server?.host
    ? {
        still: attachmentUrl(server.host, mine.bannerFileId, mine.bannerVideo === true),
        video: mine.bannerVideo === true ? attachmentUrl(server.host, mine.bannerFileId) : null,
      }
    : null;
  const shown =
    banner === undefined ? current : banner ? { still: banner.video ? null : banner.uri, video: banner.video ? banner.uri : null } : null;
  const shownBanner = shown ? (shown.still ?? shown.video) : null;

  // Your row can arrive after the sheet opens; start from it then, unless you've begun editing.
  useEffect(() => {
    if (open && mine && sameCard(draft, cardProfileOf({})) && banner === undefined) setDraft(saved);
  }, [mine?.serverUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Starts from what the server holds each time it opens, not from an abandoned draft.
  useEffect(() => {
    if (open) {
      setDraft(saved);
      setProblem(null);
      setBanner(undefined);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /* A refusal comes back as a bare string on the server you're looking at. */
  useEffect(() => {
    if (!socket || !open) return;
    const failed = (message: unknown) => setProblem(typeof message === "string" ? message : "That didn't save.");
    socket.on("profile:error", failed);
    return () => {
      socket.off("profile:error", failed);
    };
  }, [socket, open]);

  const style = draft.cardStyle;
  const setStyle = (next: Partial<CardStyle>) => setDraft((d) => ({ ...d, cardStyle: { ...d.cardStyle, ...next } }));
  const dirty = !sameCard(draft, saved) || banner !== undefined;
  // Without your own member row there's no saved card to start from, and Save would send a blank one everywhere.
  const known = mine !== undefined;

  /* The pattern's ink and strength as the card draws them, after the readability limit,
     so Strength starts where the card is and says when it's being held back. */
  const drawn = useMemo(
    () =>
      cardVars(style, mine ? owlColour(mine.nickname, mine.avatarWorn) : "#7c5cff", {
        appearance: theme.appearance,
        seed: seedFromId(mine?.serverUserId ?? ""),
      }),
    [style, mine, theme.appearance],
  );
  const strength = Math.round(drawn.patternAlpha * 100);

  /**
   * To every server you're connected to, like desktop: your card is the same everywhere.
   * A banner goes first, to the servers that take one, and a refusal from all of them stops it.
   */
  const save = async () => {
    if (!known) return;
    const sockets = Object.values(byHost)
      .filter((c) => c.online && c.socket)
      .map((c) => c.socket);
    if (sockets.length === 0) {
      setProblem("You're not connected to a server, so there's nowhere to save it.");
      return;
    }

    let refused = 0;
    // A video only goes where it's taken; the other servers keep the banner they have.
    const targets = banner?.video ? videoBannerHosts : bannerHosts;
    if (banner !== undefined && targets.length > 0) {
      setSaving(true);
      const results = await Promise.allSettled(
        targets.map(async (host) => {
          const token = await byHost[host].getAccessToken();
          if (!token) throw new Error("Not signed in there.");
          await sendBanner(host, token, banner);
          // The upload changes the row and tells nobody; this redraws the member list.
          byHost[host].socket?.emit("avatar:updated");
        }),
      );
      setSaving(false);
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed.length === results.length) {
        const reason = failed[0]?.reason instanceof Error ? failed[0].reason.message : "No server took it.";
        setProblem(`Couldn't ${banner ? "upload" : "remove"} the banner. ${reason}`);
        return;
      }
      refused = failed.length;
    }

    const payload = cardPayload(draft);
    for (const s of sockets) s?.emit("profile:update", payload);
    toast.show({
      title: refused
        ? `Card saved, but ${refused} server${refused > 1 ? "s" : ""} refused the banner`
        : sockets.length > 1
          ? `Card saved on ${sockets.length} servers`
          : "Card saved",
      severity: refused ? "warning" : "success",
    });
    onClose();
  };

  const pickBanner = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: videoBannerHosts.length > 0 ? ["images", "videos"] : ["images"],
      // Android crops to the banner's shape. iOS only crops square, which throws away most of a wide
      // picture, so it sends the whole one and the card covers it, as desktop's does.
      allowsEditing: Platform.OS === "android" && videoBannerHosts.length === 0,
      aspect: [2, 1],
      quality: 0.9,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const video = asset.type === "video";
    setBanner({
      uri: asset.uri,
      mime: asset.mimeType ?? (video ? "video/mp4" : "image/jpeg"),
      name: asset.fileName ?? (video ? "banner.mp4" : "banner.jpg"),
      video,
    });
  };

  const useLink = () => {
    const next = styleFromLink(link);
    if (!next) {
      setProblem("That isn't a card link. Copy one from the card builder or from Edit my card on desktop.");
      return;
    }
    setDraft((d) => ({ ...d, cardStyle: next }));
    setLink("");
    setProblem(null);
  };

  const groups = useMemo(() => patternGroups(), []);
  const cardWidth = Math.min(width - 32, 380);

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: theme.space(4),
            paddingVertical: theme.space(3),
            borderBottomWidth: 1,
            borderBottomColor: theme.color.border,
          }}
        >
          <Button tone="ghost" onPress={onClose}>
            Cancel
          </Button>
          <Text style={{ fontSize: 17, fontWeight: "700", color: theme.color.text }}>Edit my card</Text>
          <Button onPress={() => void save()} disabled={!known || !dirty || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </View>

        {/* The preview stays pinned, so a slider far down the list still shows what it does. */}
        <ScrollView
          stickyHeaderIndices={[0]}
          contentContainerStyle={{ paddingHorizontal: theme.space(4), gap: theme.space(5), paddingBottom: theme.space(12) }}
        >
          {mine ? (
            <View style={{ alignItems: "center", paddingVertical: theme.space(3), backgroundColor: theme.color.bg }}>
              <MemberCard
                member={{ ...mine, ...draft, cardStyle: draft.cardStyle }}
                owlHex={owlColour(mine.nickname, mine.avatarWorn)}
                avatarUrl={avatarUrlFor(mine)}
                bannerUrl={shown?.still ?? null}
                bannerVideoUrl={shown?.video ?? null}
                nameTag={nameTags.get(mine.serverUserId)}
                customEmojis={customEmojis}
                width={cardWidth}
              />
            </View>
          ) : (
            <Text style={{ color: theme.color.muted, paddingTop: theme.space(4), backgroundColor: theme.color.bg }}>
              Your card loads once the server you're looking at is connected. Until then there's nothing to save over.
            </Text>
          )}

          {problem ? <Text style={{ color: theme.color.danger }}>{problem}</Text> : null}

          {bannerHosts.length > 0 ? (
            <Section title="Banner picture">
              <Text style={{ fontSize: 13, color: theme.color.muted }}>
                {bannerHosts.length === Object.keys(byHost).length
                  ? "Shown at the top of your card instead of its colour."
                  : `Only ${bannerHosts.length === 1 ? "one of your servers takes" : `${bannerHosts.length} of your servers take`} a picture from you. The others keep showing your card's colour.`}
              </Text>
              <View style={{ flexDirection: "row", gap: theme.space(2) }}>
                <Button tone="secondary" onPress={() => void pickBanner()}>
                  {shownBanner ? "Choose another" : videoBannerHosts.length > 0 ? "Choose a picture or video" : "Choose a picture"}
                </Button>
                {shownBanner ? (
                  <Button tone="ghost" onPress={() => setBanner(current ? null : undefined)}>
                    Remove
                  </Button>
                ) : null}
              </View>
            </Section>
          ) : null}

          <Section title="Start from">
            <ChipRow>
              {BUILTIN_CARD_STYLES.map((b) => (
                <Choice key={b.id} label={b.name} onPress={() => setDraft((d) => ({ ...d, cardStyle: { ...b.style } }))} />
              ))}
              <Choice label="Surprise me" onPress={() => setDraft((d) => ({ ...d, cardStyle: randomCardStyle() }))} />
            </ChipRow>
          </Section>

          <Section title="Colour">
            <ChipRow>
              <Choice label="Owl colour" on={style.fill === "owl"} onPress={() => setStyle({ fill: "owl" })} />
              <Choice label="Solid" on={style.fill === "solid"} onPress={() => setStyle({ fill: "solid", c1: style.c1 ?? SWATCHES[9] })} />
              <Choice
                label="Gradient"
                on={style.fill === "gradient"}
                onPress={() => setStyle({ fill: "gradient", c1: style.c1 ?? SWATCHES[9], c2: style.c2 ?? SWATCHES[11] })}
              />
            </ChipRow>
            {style.fill !== "owl" ? (
              <ColourPick label={style.fill === "gradient" ? "First colour" : "Colour"} value={style.c1} onPick={(c1) => setStyle({ c1 })} />
            ) : null}
            {style.fill === "gradient" ? (
              <ColourPick label="Second colour" value={style.c2} onPick={(c2) => setStyle({ c2 })} />
            ) : null}
          </Section>

          <Section title="Colour fills">
            <ChipRow>
              <Choice label="The whole card" on={style.colours === "card"} onPress={() => setStyle({ colours: "card" })} />
              <Choice label="The banner" on={style.colours === "banner"} onPress={() => setStyle({ colours: "banner" })} />
            </ChipRow>
          </Section>

          <Section title="Banner fade">
            <ChipRow>
              <Choice label="Bottom" on={style.fade === "bottom"} onPress={() => setStyle({ fade: "bottom" })} />
              <Choice label="All of it" on={style.fade === "banner"} onPress={() => setStyle({ fade: "banner" })} />
              <Choice label="None" on={style.fade === "none"} onPress={() => setStyle({ fade: "none" })} />
            </ChipRow>
          </Section>

          <Section title="Banner height">
            <ChipRow>
              <Choice label="Tall" on={style.bannerSize !== "short"} onPress={() => setStyle({ bannerSize: undefined })} />
              <Choice label="Short" on={style.bannerSize === "short"} onPress={() => setStyle({ bannerSize: "short" })} />
            </ChipRow>
          </Section>

          <Section title="Outline">
            <Range
              label="The line around the card. None at 0."
              min={TUNING.edge.min}
              max={TUNING.edge.max}
              value={style.edge ?? TUNING.edge.default}
              unit="px"
              onChange={(v) => setStyle({ edge: v === TUNING.edge.default ? undefined : v })}
            />
          </Section>

          <Section title="Pattern">
            {groups.map(({ group, patterns }) => (
              <View key={group} style={{ gap: theme.space(1.5) }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: theme.color.muted }}>{group}</Text>
                {/* One row per heading that scrolls sideways; wrapped, the tiles alone were six screens tall. */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space(1.5) }}>
                  {patterns.map((p) => (
                    <Choice key={p.id} label={p.name} on={style.pattern === p.id} onPress={() => setStyle({ pattern: p.id })} />
                  ))}
                </ScrollView>
              </View>
            ))}
            {style.pattern === "icon" ? (
              <TextField
                label="Icon"
                helperText="A Phosphor icon's name, like rocket-launch or game-controller."
                value={style.pIcon ?? ""}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(v) => setStyle({ pIcon: v.trim().toLowerCase() || undefined })}
              />
            ) : null}
            {style.pattern === "emoji" ? (
              <EmojiChoice value={style.pEmoji} customEmojis={customEmojis} onChange={(pEmoji) => setStyle({ pEmoji })} />
            ) : null}
          </Section>

          {style.colours === "card" && style.pattern !== "none" ? (
            <Section title="Pattern covers">
              <ChipRow>
                <Choice label="The banner" on={style.cover !== "card"} onPress={() => setStyle({ cover: "banner" })} />
                <Choice label="The whole card" on={style.cover === "card"} onPress={() => setStyle({ cover: "card" })} />
              </ChipRow>
            </Section>
          ) : null}

          {shownBanner && style.pattern !== "none" ? (
            <Section title="Pattern sits">
              <ChipRow>
                <Choice label="Behind the banner" on={style.pLayer !== "front"} onPress={() => setStyle({ pLayer: undefined })} />
                <Choice label="In front of the banner" on={style.pLayer === "front"} onPress={() => setStyle({ pLayer: "front" })} />
              </ChipRow>
            </Section>
          ) : null}

          {isTunable(style.pattern) ? (
            <Section title="Customise pattern">
              <Text style={{ fontSize: 13, color: theme.color.muted }}>
                The strength is turned down if it would make small text hard to read.
              </Text>
              <Range label="Size" min={TUNING.pScale.min} max={TUNING.pScale.max} value={style.pScale} unit="%" onChange={(v) => setStyle({ pScale: v })} />
              <Range label="Rotation" min={TUNING.pRotate.min} max={TUNING.pRotate.max} value={style.pRotate} unit="°" onChange={(v) => setStyle({ pRotate: v })} />
              {cardPattern(style.pattern).kind !== "scatter" ? (
                <Range
                  label="Line weight"
                  min={TUNING.pStroke.min}
                  max={TUNING.pStroke.max}
                  value={style.pStroke ?? TUNING.pStroke.default}
                  unit="%"
                  onChange={(v) => setStyle({ pStroke: v === TUNING.pStroke.default ? undefined : v })}
                />
              ) : null}
              <Range
                label="Strength"
                min={TUNING.pOpacity.min}
                max={TUNING.pOpacity.max}
                value={Math.min(TUNING.pOpacity.max, Math.max(TUNING.pOpacity.min, style.pOpacity ?? strength))}
                unit="%"
                onChange={(v) => setStyle({ pOpacity: v })}
              />
              {style.pOpacity !== undefined && strength < style.pOpacity ? (
                <Text style={{ fontSize: 12, color: theme.color.muted }}>
                  Held at {strength}% so the small text on your card stays readable.
                </Text>
              ) : null}
              <Text style={{ fontSize: 12, fontWeight: "700", color: theme.color.muted }}>Fade</Text>
              <ChipRow>
                {PATTERN_FADES.map((f) => (
                  <Choice key={f} label={FADE_LABEL[f]} on={style.pFade === f} onPress={() => setStyle({ pFade: f })} />
                ))}
              </ChipRow>
              <ColourPick label="Colour" value={style.pInk ?? drawn.patternInk} onPick={(pInk) => setStyle({ pInk })} />
              <ChipRow>
                {style.pInk ? <Choice label="Use the card's own" onPress={() => setStyle({ pInk: undefined })} /> : null}
                {cardPattern(style.pattern).kind === "scatter" ? (
                  <Choice label="Shuffle" onPress={() => setStyle({ pSeed: Math.floor(Math.random() * (TUNING.pSeed.max + 1)) })} />
                ) : null}
                <Choice
                  label="Reset"
                  onPress={() =>
                    setStyle({ pScale: 100, pRotate: 0, pOpacity: undefined, pFade: "none", pSeed: undefined, pInk: undefined, pStroke: undefined })
                  }
                />
              </ChipRow>
            </Section>
          ) : null}

          <Section title="From a link">
            <TextField
              label="Card link"
              helperText="Paste a link from the card builder at ui.gryt.chat, or from somebody's card."
              value={link}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setLink}
            />
            <View style={{ flexDirection: "row" }}>
              <Button tone="secondary" onPress={useLink} disabled={!link.trim()}>
                Use this card
              </Button>
            </View>
          </Section>

          <Section title="About you">
            <TextField
              label="Status"
              helperText="Shown on your card when you're not playing anything."
              value={draft.statusLine ?? ""}
              maxLength={LIMITS.statusLine}
              onChangeText={(v) => setDraft((d) => ({ ...d, statusLine: v || null }))}
            />
            <TextField
              label="Pronouns"
              value={draft.pronouns ?? ""}
              maxLength={LIMITS.pronouns}
              autoCapitalize="none"
              onChangeText={(v) => setDraft((d) => ({ ...d, pronouns: v || null }))}
            />
            <TextField
              label="Bio"
              multiline
              minRows={3}
              value={draft.bio ?? ""}
              maxLength={LIMITS.bio}
              onChangeText={(v) => setDraft((d) => ({ ...d, bio: v || null }))}
            />
          </Section>
        </ScrollView>
      </View>
    </Modal>
  );
}

const FADE_LABEL: Record<PatternFade, string> = {
  none: "No fade",
  top: "To the top",
  bottom: "To the bottom",
  left: "To the left",
  right: "To the right",
  radial: "To the edges",
};

/** A labelled slider with its value beside the label, like desktop's Range. */
function Range({
  label,
  min,
  max,
  value,
  unit,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space(1) }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: theme.color.muted, flexShrink: 1 }}>{label}</Text>
        <Text mono style={{ fontSize: 12, color: theme.color.muted }}>
          {value}
          {unit}
        </Text>
      </View>
      <Slider min={min} max={max} step={1} value={value} onValueChange={(v) => onChange(Math.round(v))} accessibilityLabel={label} />
    </View>
  );
}

/** The pattern's emoji, picked like a reaction from the standard set and this server's own.
    Ids match desktop's picker: `unicode:` and the character, or `server:` and the name. */
function EmojiChoice({
  value,
  customEmojis,
  onChange,
}: {
  value: string | undefined;
  customEmojis: ReadonlyMap<string, string>;
  onChange: (pEmoji: string) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const id = value ?? DEFAULT_EMOJI;
  const serverName = id.startsWith("server:") ? id.slice(7) : null;
  const unicode = id.startsWith("unicode:") ? id.slice(8) : null;
  const url = serverName ? customEmojis.get(serverName) : undefined;
  return (
    <View style={{ gap: theme.space(1.5) }}>
      <Text style={{ fontSize: 12, fontWeight: "700", color: theme.color.muted }}>Emoji</Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Choose the pattern's emoji"
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(3),
          paddingHorizontal: theme.space(3),
          paddingVertical: theme.space(2),
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.color.border,
          backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surface,
        })}
      >
        {url ? (
          <Image source={{ uri: url }} style={{ width: 28, height: 28 }} resizeMode="contain" />
        ) : (
          <Text style={{ fontSize: 26 }}>{unicode ?? "✨"}</Text>
        )}
        <Text style={{ flex: 1, fontSize: 15, color: theme.color.text }}>{serverName ? `:${serverName}:` : "Standard emoji"}</Text>
        <Text style={{ fontSize: 15, fontWeight: "600", color: theme.color.accent }}>Change</Text>
      </Pressable>
      {serverName && !url ? (
        <Text style={{ fontSize: 13, color: theme.color.muted }}>
          {`:${serverName}: belongs to another server, so cards here show ✨ in its place.`}
        </Text>
      ) : null}
      <EmojiPicker
        open={open}
        onOpenChange={setOpen}
        title="Pattern emoji"
        onPickEntry={(entry) => {
          if (entry.isCustom) onChange(`server:${entry.name}`);
          else if (entry.emoji) onChange(`unicode:${entry.emoji}`);
        }}
      />
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space(2) }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: theme.color.text }}>{title}</Text>
      {children}
    </View>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space(1.5) }}>{children}</View>;
}

/** One choice of several. Picked shows filled, like a segmented control. */
function Choice({ label, on = false, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => ({
        paddingHorizontal: theme.space(3),
        paddingVertical: theme.space(1.5),
        borderRadius: theme.radius.full,
        borderWidth: 1,
        borderColor: on ? theme.color.accent : theme.color.border,
        backgroundColor: on ? theme.color.accent : pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
      })}
    >
      <Text style={{ fontSize: 13, fontWeight: "600", color: on ? theme.color.onAccent : theme.color.text }}>{label}</Text>
    </Pressable>
  );
}

/** Swatches to tap, and a hex field for anything else. */
function ColourPick({ label, value, onPick }: { label: string; value: string | undefined; onPick: (hex: string) => void }) {
  const theme = useTheme();
  const [typed, setTyped] = useState(value ?? "");
  useEffect(() => setTyped(value ?? ""), [value]);
  return (
    <View style={{ gap: theme.space(1.5) }}>
      <Text style={{ fontSize: 12, fontWeight: "700", color: theme.color.muted }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space(2) }}>
        {SWATCHES.map((hex) => (
          <Pressable
            key={hex}
            onPress={() => onPick(hex)}
            accessibilityRole="button"
            accessibilityLabel={hex}
            accessibilityState={{ selected: value === hex }}
            style={{
              width: 32,
              height: 32,
              borderRadius: Math.min(16, theme.radius.full),
              backgroundColor: hex,
              borderWidth: value === hex ? 3 : 1,
              borderColor: value === hex ? theme.color.accent : theme.color.border,
            }}
          />
        ))}
      </View>
      <TextField
        size="small"
        value={typed}
        placeholder="#rrggbb"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(v) => {
          setTyped(v);
          const hex = hexFrom(v);
          if (hex) onPick(hex);
        }}
      />
    </View>
  );
}
