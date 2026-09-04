/**
 * The file token, in memory, for the one caller that cannot wait.
 * `attachmentUrl` builds a string synchronously during render, and
 * `SecureStore` is async — and the token has to be in the URL because an image
 * request carries no headers of ours (GRYT-740).
 *
 * **Its own module, with no `expo-secure-store` import.** Inside `tokens.ts`,
 * importing the URL builder pulled SecureStore and the whole of react-native
 * into three plain string tests that vitest could then not parse.
 *
 * `tokens.ts` fills this from every path that produces a session. Empty means a
 * 401 and a failed picture, which is what an expired token does too.
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
