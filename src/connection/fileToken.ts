/**
 * The file token, in memory, for the one caller that cannot wait.
 *
 * `attachmentUrl` builds a string for an `Image source`, synchronously, during
 * render. The durable copy lives in the Keychain and `SecureStore` is async, so
 * it cannot be read there — and the token has to be in the URL rather than a
 * header because an image request carries none of ours. See GRYT-740.
 *
 * Its own module, with no `expo-secure-store` import, and that is the point.
 * This started inside `tokens.ts`; importing the URL builder then pulled
 * SecureStore and the whole of react-native into three test files that had been
 * plain string tests, and vitest could not parse them. The durable store and the
 * hot copy are different concerns, and keeping them apart is what lets one be
 * tested without the other.
 *
 * `tokens.ts` fills this from a join, a refresh, and once from storage when a
 * session is restored — every path that produces a session. Empty means URLs go
 * out without a token, the server answers 401, and the picture fails, which is
 * what an expired token does too.
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
