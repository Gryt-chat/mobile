import {
  blend,
  cardPattern,
  cardVars,
  hexOf,
  oklch,
  type CardStyle,
  type PatternMark,
} from "@gryt/ui/card-core";
import type { Tile } from "@gryt/ui/card-tiles";
import { okToRgb } from "./okToRgb";

/* The member card's look as React Native can draw it (GRYT-1630). `cardVars` speaks CSS,
   oklch(), linear-gradient() and a data: URL, and this turns it into hex, stops and markup. */

/** A fill: one colour, or two at an angle in CSS degrees (0 is up, 90 is right). */
export interface Fill {
  from: string;
  to: string;
  angle: number;
}

export interface CardLook {
  /** The whole card in the member's colours, rather than only the banner. */
  full: boolean;
  /** What the card itself is filled with. Null is the theme's surface. */
  card: Fill | null;
  /** Ink and muted ink on the card, or null for the theme's own. */
  text: string | null;
  muted: string | null;
  banner: Fill;
  /** The pattern as SVG markup, sized by whoever draws it. */
  pattern: string | null;
  /** Where the pattern goes on a card coloured whole: on the banner, or the whole card. */
  patternOnCard: boolean;
  /** Over a banner picture, rather than under it. */
  patternInFront: boolean;
  /** How the banner melts into the card below it on a card coloured whole. */
  fade: "bottom" | "full" | "none";
  /**
   * While a game plays, the name's backdrop fades into `--band` rather than the surface,
   * and on a banner-coloured card the name takes the band's ink. Null on a card coloured whole.
   */
  band: { colour: string; ink: string | null } | null;
  /** `--m-accent`: the band's heading. */
  accent: string;
  /** A filled party pip, and a Rich Presence button's fill and label. Null keeps the theme's ink. */
  pip: string | null;
  button: { bg: string; fg: string };
}

/** Splits at the commas that aren't inside brackets. */
function topLevel(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      out.push(args.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(args.slice(start).trim());
  return out;
}

/** A CSS colour as RN takes it. Handles hex and oklch(), which is all `cardVars` writes. */
export function rnColour(css: string): string {
  const mix = /^color-mix\(in ok(?:lab|lch),\s*(.*)\)$/s.exec(css.trim());
  if (mix) {
    const [a, b] = topLevel(mix[1]).map((part) => rnColour(part.replace(/\s+[\d.]+%$/, "")));
    return blend(a.slice(0, 7), b.slice(0, 7), 0.5);
  }
  const m = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(css.trim());
  if (!m) return css.trim();
  const hex = hexOf(okToRgb(Number(m[1]) / 100, Number(m[2]), Number(m[3])));
  if (m[4] === undefined) return hex;
  const a = Math.round(Number(m[4]) * 255).toString(16).padStart(2, "0");
  return hex + a;
}

/** `linear-gradient(160deg, a, b)` or `linear-gradient(a, a)` as a fill. */
export function parseGradient(css: string | undefined): Fill | null {
  if (!css) return null;
  const m = /^linear-gradient\((.*)\)$/s.exec(css.trim());
  if (!m) return { from: rnColour(css), to: rnColour(css), angle: 180 };
  const parts = topLevel(m[1]);
  let angle = 180;
  if (/^-?[\d.]+deg$/.test(parts[0])) angle = parseFloat(parts.shift() as string);
  const stop = (s: string) => rnColour(s.replace(/\s+[\d.]+%$/, ""));
  return { from: stop(parts[0]), to: stop(parts[parts.length - 1]), angle };
}

/** The pattern's markup out of the `url("data:image/svg+xml,…")` `patternLayers` makes. */
export function svgOf(cssUrl: string | undefined): string | null {
  if (!cssUrl) return null;
  const m = /^url\("data:image\/svg\+xml,(.*)"\)$/s.exec(cssUrl);
  return m ? decodeURIComponent(m[1]) : null;
}

const solid = (hex: string): Fill => ({ from: hex, to: hex, angle: 180 });

/** `--m-accent`: the card's hue at the theme's lightness. */
function accentAt(H: number, dark: boolean): string {
  return hexOf(okToRgb(dark ? 0.76 : 0.52, dark ? 0.13 : 0.14, H));
}

const accentOf = (owlHex: string, dark: boolean) => accentAt(oklch(owlHex).H, dark);

export function cardLook(
  style: CardStyle,
  owlHex: string,
  opts: { appearance: "light" | "dark"; seed: number; surface: string; tile?: Tile; mark?: PatternMark },
): CardLook {
  const { attrs, vars } = cardVars(style, owlHex, {
    appearance: opts.appearance,
    seed: opts.seed,
    tile: opts.tile,
    mark: opts.mark,
  });
  const fade = attrs["data-fade"] === "full" ? "full" : attrs["data-fade"] === "none" ? "none" : "bottom";
  const pattern = svgOf(vars["--pat-img"]);
  const patternInFront = attrs["data-player"] === "front";

  if (attrs["data-fc"]) {
    const card = parseGradient(vars["--fc-bg"]);
    return {
      full: true,
      card,
      text: rnColour(vars["--gryt-text"]),
      muted: rnColour(vars["--gryt-muted"]),
      banner: parseGradient(vars["--base"]) ?? solid(owlHex),
      pattern,
      patternOnCard: attrs["data-cover"] === "card",
      patternInFront,
      fade,
      band: null,
      accent: rnColour(vars["--gryt-text"]),
      pip: rnColour(vars["--gryt-text"]),
      button: { bg: rnColour(vars["--gryt-text"]), fg: rnColour(vars["--gryt-on-accent"]) },
    };
  }

  if (attrs["data-cc"]) {
    return {
      full: false,
      card: null,
      text: null,
      muted: null,
      banner: parseGradient(vars["--base"]) ?? solid(owlHex),
      pattern,
      patternOnCard: false,
      patternInFront,
      fade,
      band: { colour: rnColour(vars["--band"]), ink: rnColour(vars["--band-ink"]) },
      accent: accentAt(Number(vars["--m-hue"]), opts.appearance === "dark"),
      pip: null,
      button: { bg: rnColour(vars["--band-ink"]), fg: rnColour(vars["--band-btn-ink"]) },
    };
  }

  // The owl's own colour. Gradient and Dusk replace the banner's fill rather than lying over it.
  const dark = opts.appearance === "dark";
  const accent = accentOf(owlHex, dark);
  const kind = cardPattern(style.pattern);
  let banner = solid(owlHex);
  if (kind.id === "gradient") banner = { from: owlHex, to: blend(opts.surface, accent, 0.6), angle: 135 };
  else if (kind.id === "dusk") banner = { from: owlHex, to: opts.surface, angle: 180 };
  return {
    full: false,
    card: null,
    text: null,
    muted: null,
    banner,
    pattern,
    patternOnCard: false,
    patternInFront,
    fade,
    band: { colour: blend(opts.surface, accent, 0.16), ink: null },
    accent,
    pip: accent,
    button: { bg: accent, fg: hexOf(okToRgb(dark ? 0.18 : 0.99, 0.03, oklch(owlHex).H)) },
  };
}

/**
 * The banner as one SVG: its fill, the pattern over it, and on a card coloured whole the
 * fade into the card, as a real mask rather than a colour laid over it, so there's no seam.
 */
export function bannerXml(look: CardLook, width: number, height: number, withPattern: boolean): string {
  const rad = (look.banner.angle * Math.PI) / 180;
  const dx = Math.sin(rad) / 2;
  const dy = -Math.cos(rad) / 2;
  const n = (v: number) => String(Math.round(v * 1000) / 1000);
  const base =
    `<linearGradient id='gmcBase' x1='${n(0.5 - dx)}' y1='${n(0.5 - dy)}' x2='${n(0.5 + dx)}' y2='${n(0.5 + dy)}'>` +
    `<stop offset='0' stop-color='${look.banner.from}'/><stop offset='1' stop-color='${look.banner.to}'/></linearGradient>`;
  const stops =
    look.fade === "full"
      ? "<stop offset='0' stop-color='#fff' stop-opacity='0.9'/><stop offset='0.55' stop-color='#fff' stop-opacity='0.45'/><stop offset='1' stop-color='#fff' stop-opacity='0'/>"
      : "<stop offset='0.45' stop-color='#fff' stop-opacity='1'/><stop offset='1' stop-color='#fff' stop-opacity='0'/>";
  const masked = look.full && look.fade !== "none";
  const mask = masked
    ? `<linearGradient id='gmcFadeG' x1='0' y1='0' x2='0' y2='1'>${stops}</linearGradient>` +
      `<mask id='gmcFadeM'><rect width='${width}' height='${height}' fill='url(#gmcFadeG)'/></mask>`
    : "";
  const pattern =
    withPattern && look.pattern ? look.pattern.replace(/^<svg[^>]*>/, `<svg x='0' y='0' width='${width}' height='${height}'>`) : "";
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'>` +
    `<defs>${base}${mask}</defs><g${masked ? " mask='url(#gmcFadeM)'" : ""}>` +
    `<rect width='${width}' height='${height}' fill='url(#gmcBase)'/>${pattern}</g></svg>`
  );
}
