import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { Button, Text, TextField, useTheme, useToast } from "@gryt/ui-native";
import {
  BUILTIN_CARD_STYLES,
  cardProfileOf,
  randomCardStyle,
  type CardProfile,
  type CardStyle,
} from "@gryt/ui/card-core";

import { useCustomEmojis } from "../chat/CustomEmojiProvider";
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
  const customEmojis = useCustomEmojis();

  const mine = me ? all.find((m) => m.serverUserId === me.serverUserId) : undefined;
  const saved = useMemo<CardProfile>(() => cardProfileOf(mine ?? {}), [mine]);
  const [draft, setDraft] = useState<CardProfile>(saved);
  const [link, setLink] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  // Starts from what the server holds each time it opens, not from an abandoned draft.
  useEffect(() => {
    if (open) {
      setDraft(saved);
      setProblem(null);
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
  const dirty = !sameCard(draft, saved);

  /** To every server you're connected to, like desktop: your card is the same everywhere. */
  const save = () => {
    const payload = cardPayload(draft);
    const sockets = Object.values(byHost)
      .filter((c) => c.online && c.socket)
      .map((c) => c.socket);
    if (sockets.length === 0) {
      setProblem("You're not connected to a server, so there's nowhere to save it.");
      return;
    }
    for (const s of sockets) s?.emit("profile:update", payload);
    toast.show({ title: sockets.length > 1 ? `Card saved on ${sockets.length} servers` : "Card saved", severity: "success" });
    onClose();
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
          <Button onPress={save} disabled={!dirty}>
            Save
          </Button>
        </View>

        <ScrollView contentContainerStyle={{ padding: theme.space(4), gap: theme.space(5), paddingBottom: theme.space(12) }}>
          {mine ? (
            <View style={{ alignItems: "center" }}>
              <MemberCard
                member={{ ...mine, ...draft, cardStyle: draft.cardStyle }}
                owlHex={owlColour(mine.nickname, mine.avatarWorn)}
                avatarUrl={avatarUrlFor(mine)}
                bannerUrl={null}
                nameTag={nameTags.get(mine.serverUserId)}
                customEmojis={customEmojis}
                width={cardWidth}
              />
            </View>
          ) : (
            <Text style={{ color: theme.color.muted }}>Join a server to see your card here.</Text>
          )}

          {problem ? <Text style={{ color: theme.color.danger }}>{problem}</Text> : null}

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

          <Section title="Pattern">
            {groups.map(({ group, patterns }) => (
              <View key={group} style={{ gap: theme.space(1.5) }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: theme.color.muted }}>{group}</Text>
                <ChipRow>
                  {patterns.map((p) => (
                    <Choice key={p.id} label={p.name} on={style.pattern === p.id} onPress={() => setStyle({ pattern: p.id })} />
                  ))}
                </ChipRow>
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
              <TextField
                label="Emoji"
                helperText="One emoji, or the name of one of this server's own."
                value={style.pEmoji?.replace(/^(unicode|server):/, "") ?? ""}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(v) => {
                  const t = v.trim();
                  if (!t) return setStyle({ pEmoji: undefined });
                  setStyle({ pEmoji: customEmojis.has(t) ? `server:${t}` : `unicode:${t}` });
                }}
              />
            ) : null}
          </Section>

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
              borderRadius: 16,
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
