/**
 * The file token, in memory, for the one caller that cannot wait:
 * `attachmentUrl` builds a string synchronously during render, and the token
 * has to be in the URL because an image request carries no headers (GRYT-740).
 *
 * **Its own module, with no `expo-secure-store` import** — inside `tokens.ts`
 * it pulled react-native into three plain string tests vitest could not parse.
 */
const fileTokens = new Map<string, string>();

export function setFileToken(host: string, token: string | undefined): void {
  if (token) fileTokens.set(host, token);
}

export function getFileToken(host: string): string | undefined {
  return fileTokens.get(host);
}

export function forgetFileToken(host: string): void {
  fileTokens.delete(host);
}
