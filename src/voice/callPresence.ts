/** Whether a member is in the voice channel you're in right now (GRYT-1537). */
export function isInSameCall(
  myVoiceChannelId: string | null | undefined,
  memberVoiceChannelId: string | null | undefined,
): boolean {
  return !!myVoiceChannelId && myVoiceChannelId === memberVoiceChannelId;
}
