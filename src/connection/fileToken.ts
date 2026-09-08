/**
 * The file token in memory, for the one caller that cannot wait: `attachmentUrl` builds a
 * string during render. Its own module so `expo-secure-store` stays out of tests (GRYT-740).
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
