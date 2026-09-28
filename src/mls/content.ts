/**
 * What goes inside an MLS application message in a DM. JSON, versioned. The desktop has to
 * write the same shape; until it lives in @gryt/core, this is the reference (GRYT-1521).
 */

export type MlsContent =
  | { type: "message"; id: string; text: string; replyTo?: string }
  | { type: "edit"; id: string; text: string }
  | { type: "delete"; id: string };

const VERSION = 1;
/** Ids are client-made UUIDs; anything much longer is not one of ours. */
const MAX_ID = 64;

export function encodeMlsContent(content: MlsContent): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ v: VERSION, ...content }));
}

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_ID;

/** Null for anything this app can't read: a newer version, a new type, or junk. */
export function decodeMlsContent(bytes: Uint8Array): MlsContent | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || raw.v !== VERSION || !isId(raw.id)) return null;
  const { type, id, text } = raw;
  if (type === "message" && typeof text === "string") {
    return isId(raw.replyTo) ? { type, id, text, replyTo: raw.replyTo } : { type, id, text };
  }
  if (type === "edit" && typeof text === "string") return { type, id, text };
  if (type === "delete") return { type, id };
  return null;
}

/** Only a new message leaves a line for apps from before MLS (GRYT-1517). */
export function leavesPlaceholder(content: MlsContent): boolean {
  return content.type === "message";
}
