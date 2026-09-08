/**
 * The file token, in memory, for the one caller that cannot wait: `attachmentUrl` builds
 * a string during render. **Its own module, with no `expo-secure-store` import**, which
 * pulled react-native into three plain string tests (GRYT-740).
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
