import { avatarSeed, decodeWorn, owlAvatarColour, wornToOptions } from "@gryt/owl";

/** The fallback desktop uses when a name gives no seed. */
const FALLBACK_OWL = "#7c5cff";

/** The owl's colour, which a card is drawn in until its owner picks one. Same as the desktop's. */
export function owlColour(nickname: string, worn?: string | null): string {
  const seed = avatarSeed(nickname);
  if (!seed) return FALLBACK_OWL;
  const look = decodeWorn(worn);
  return look ? owlAvatarColour(seed, wornToOptions(look)) : owlAvatarColour(seed);
}
