/** The push-to-talk setting, and whether the talk button is held right now. */
export interface PushToTalk {
  enabled: boolean;
  held: boolean;
}

export function parsePushToTalk(raw: unknown): boolean {
  return !!raw && typeof raw === "object" && (raw as Record<string, unknown>).enabled === true;
}

/**
 * The microphone the engine is told about. Your own mute wins over a held button, which is the
 * rule the desktop's gate keeps: opening while muted would send what you said not to.
 */
export function micMuted(muted: boolean, ptt: PushToTalk): boolean {
  return muted || (ptt.enabled && !ptt.held);
}
