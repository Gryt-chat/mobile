import {
  BIO_MAX,
  cardStyleForWire,
  CARD_PATTERNS,
  decodeGrytCard,
  normalizeCardStyle,
  PATTERN_GROUPS,
  PRONOUNS_MAX,
  STATUS_LINE_MAX,
  type CardProfile,
  type CardPattern,
} from "@gryt/ui/card-core";

/* Edit my card's pure half (GRYT-1630): what Save sends, and the lists the editor offers.
   The same payload as desktop's cardUpdatePayload, so a card saved on either reads alike. */

export const LIMITS = { bio: BIO_MAX, pronouns: PRONOUNS_MAX, statusLine: STATUS_LINE_MAX } as const;

/** What `profile:update` carries for a card. A plain card is sent as `{ plain: true }`. */
export function cardPayload(card: CardProfile) {
  return {
    cardStyle: cardStyleForWire(card.cardStyle) ?? { plain: true as const },
    bio: card.bio,
    pronouns: card.pronouns,
    statusLine: card.statusLine,
  };
}

/** Whether Save has anything to send. */
export function sameCard(a: CardProfile, b: CardProfile): boolean {
  return JSON.stringify(cardPayload(a)) === JSON.stringify(cardPayload(b));
}

/**
 * A pasted card link or code, from the card builder or from somebody's card. Accepts the
 * whole URL or just the part after `?`. Null when it isn't one.
 */
export function styleFromLink(text: string): CardProfile["cardStyle"] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const query = trimmed.includes("?") ? trimmed.slice(trimmed.indexOf("?") + 1) : trimmed;
  const decoded = decodeGrytCard(query);
  return decoded ? normalizeCardStyle(decoded) : null;
}

/** The patterns under their headings, in Edit my card's order. */
export function patternGroups(): { group: string; patterns: CardPattern[] }[] {
  return PATTERN_GROUPS.map((group) => ({ group, patterns: CARD_PATTERNS.filter((p) => p.group === group) }));
}

/** Colours to tap, since a phone has no colour picker worth using. A hex field covers the rest. */
export const SWATCHES = [
  "#e5484d", "#f76b15", "#ffc53d", "#d4a017", "#46a758", "#0f766e",
  "#12a594", "#0090ff", "#1e3a8a", "#6e56cf", "#7c3aed", "#d6409f",
  "#f472b6", "#8d8d86", "#2b2b2b", "#f5f5f4",
] as const;

/** `#rrggbb` from what somebody typed, or null. Accepts it with or without the `#`. */
export function hexFrom(text: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(text.trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}
