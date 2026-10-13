/** The kinds of message this app draws. Anything else gets a line saying to update. */
export const KNOWN_KINDS: readonly string[] = ["poll"];

export function isUnknownKind(message: { kind?: string }): boolean {
  return !!message.kind && !KNOWN_KINDS.includes(message.kind);
}

/** Whether `text` is drawn: cards, polls and unknown kinds stand in for it. */
export function drawsText(message: { text_fallback?: boolean; kind?: string; poll?: unknown }): boolean {
  return message.text_fallback !== true && !message.kind && !message.poll;
}

/** What an app says in place of a message it can't draw. Plugin kinds are `plugin:<id>:<name>`. */
export function unknownKindNotice(kind: string): string {
  const plugin = /^plugin:([^:]+):/.exec(kind)?.[1];
  return plugin
    ? `This message is from the ${plugin} plugin, which this app doesn't have.`
    : "This message needs a newer version of Gryt. Update to see it.";
}
