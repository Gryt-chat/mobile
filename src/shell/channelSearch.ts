/** The server's search snippet, split at its hit markers: \u0002 opens a hit and \u0003 closes it. */
export function snippetParts(snippet: string): { text: string; hit: boolean }[] {
  const parts: { text: string; hit: boolean }[] = [];
  let hit = false;
  let text = "";
  for (const ch of snippet) {
    if (ch === "\u0002" || ch === "\u0003") {
      if (text) parts.push({ text, hit });
      text = "";
      hit = ch === "\u0002";
    } else {
      text += ch;
    }
  }
  if (text) parts.push({ text, hit });
  return parts;
}

export interface SearchHit {
  conversation_id: string;
  message_id: string;
  sender_server_id: string;
  sender_display_name: string | null;
  created_at: string;
  snippet: string;
}
