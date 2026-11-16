import { base64UrlDecode } from "@gryt/crypto";

import { type PublicJwk, verifyJwtSignature } from "../identity/keys";
import { accountConfig } from "./config";

/* "Approve me" asks between your own devices, checked as the desktop checks them. The identity service
   signs the ticket, so a server can relay one but never make one up; each device caps what it shows. */

const MAX_PROMPTS_PER_HOUR = 3;
const seen = new Set<string>();
let shownAt: number[] = [];
let pending: string | null = null;

/** The ticket this phone got with `approval_required`, sent to your other devices until it's approved. */
export function setPendingApproveTicket(ticket: string | null): void {
  pending = ticket;
}

export function pendingApproveTicket(): string | null {
  return pending;
}

type Jwk = PublicJwk & { kid?: string };

let jwks: Promise<Jwk[]> | null = null;
function identityKeys(): Promise<Jwk[]> {
  jwks ??= fetch(`${accountConfig().identityUrl.replace(/\/+$/, "")}/.well-known/jwks.json`)
    .then((r) => (r.ok ? r.json() : { keys: [] }))
    .then((b: { keys?: Jwk[] }) => b.keys ?? [])
    .catch(() => {
      jwks = null;
      return [];
    });
  return jwks;
}

interface TicketPart {
  typ?: string;
  alg?: string;
  kid?: string;
  purpose?: string;
  sub?: string;
  exp?: number;
  jti?: string;
  deviceType?: string;
}

const json = (part: string) => (JSON.parse(new TextDecoder().decode(base64UrlDecode(part))) ?? {}) as TicketPart;

/** The ask's device type, when the ticket is real, for this account, fresh and not shown before. */
export async function checkApproveTicket(
  ticket: string,
  mySub: string,
  now = Date.now(),
  keys: () => Promise<Jwk[]> = identityKeys,
): Promise<{ deviceType: string } | null> {
  const parts = ticket.split(".");
  if (parts.length !== 3) return null;
  let header: TicketPart;
  let payload: TicketPart;
  let signature: Uint8Array;
  try {
    header = json(parts[0]);
    payload = json(parts[1]);
    signature = base64UrlDecode(parts[2]);
  } catch {
    return null;
  }
  if (header.typ !== "gryt-approve+jwt" || header.alg !== "ES256" || payload.purpose !== "approve-ask") return null;
  if (payload.sub !== mySub || typeof payload.exp !== "number" || payload.exp * 1000 < now) return null;
  const jti = typeof payload.jti === "string" ? payload.jti : "";
  if (!jti || seen.has(jti)) return null;

  const jwk = (await keys()).find((k) => k.kid === header.kid);
  if (!jwk || !verifyJwtSignature(`${parts[0]}.${parts[1]}`, signature, jwk)) return null;

  shownAt = shownAt.filter((t) => now - t < 60 * 60 * 1000);
  if (shownAt.length >= MAX_PROMPTS_PER_HOUR) return null;
  seen.add(jti);
  shownAt.push(now);
  return { deviceType: typeof payload.deviceType === "string" && payload.deviceType ? payload.deviceType : "device" };
}
