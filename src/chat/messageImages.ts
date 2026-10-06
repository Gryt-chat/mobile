/**
 * Whether an image in a message may load (GRYT-1660). Only from the server the message is on,
 * or another Gryt server's emoji when this server allows them, since the host sees who reads it.
 */

import { getServerHttpBase } from "../servers/address";

export type ImageVerdict = "emoji" | "name" | "link";

const EMOJI_ALT = /^:[A-Za-z0-9_+-]+:$/;
const EMOJI_PATH = /^\/api\/emojis\/img\/[^/]+$/;

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** "emoji" draws it inline, "name" shows the alt text, "link" offers the address to open. */
export function imageVerdict(src: string, alt: string, serverHost: string | null, externalAllowed: boolean): ImageVerdict {
  const host = hostOf(src);
  if (!EMOJI_ALT.test(alt)) return "link";
  if (!host || !serverHost) return "name";
  if (host === hostOf(getServerHttpBase(serverHost))) return "emoji";
  let path = "";
  try {
    path = new URL(src).pathname;
  } catch {
    return "name";
  }
  return externalAllowed && EMOJI_PATH.test(path) ? "emoji" : "name";
}
