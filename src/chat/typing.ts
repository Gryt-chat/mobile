/**
 * Who is typing, and when to say that you are. **All of it is timestamps rather than
 * timers**: a backgrounded phone stops running timers and then fires them at once,
 * and asking who is still within the window is a pure function.
 */

/**
 * How often to say it while somebody keeps typing. The server's rate limit is 30 in
 * 10 seconds and it drops what it does not allow, silently.
 */
export const TYPING_THROTTLE_MS = 3_000;

/**
 * How long a claim stands without being renewed: the server's own `TYPING_TIMEOUT_MS`.
 * **Matching it is the point**, or the two disagree about the same person.
 */
export const TYPING_TIMEOUT_MS = 8_000;

export interface Typer {
  serverUserId: string;
  nickname: string;
  avatarFileId: string | null;
  /** When they last said so. */
  at: number;
}

/** Somebody said they are typing. Replaces whatever was there for them. */
export function noteTyping(
  typers: Typer[],
  typer: Omit<Typer, "at">,
  now: number,
): Typer[] {
  return [...typers.filter((t) => t.serverUserId !== typer.serverUserId), { ...typer, at: now }];
}

/** They stopped, or the server said they did. */
export function dropTyper(typers: Typer[], serverUserId: string): Typer[] {
  return typers.filter((t) => t.serverUserId !== serverUserId);
}

/**
 * Who is still within the window. Also what makes a dropped `chat:stop_typing`
 * harmless: the line goes away on its own eight seconds later.
 */
export function activeTypers(typers: Typer[], now: number): Typer[] {
  return typers.filter((t) => now - t.at < TYPING_TIMEOUT_MS);
}

/**
 * Whether to put another `chat:typing` on the wire. `null` means not currently
 * claiming, so the first keystroke always emits.
 */
export function shouldEmitTyping(lastEmit: number | null, now: number): boolean {
  return lastEmit === null || now - lastEmit >= TYPING_THROTTLE_MS;
}

/**
 * The sentence. Names up to two, then a count: three names is longer than the message
 * being typed, and the row is one line.
 */
export function typingLabel(names: string[]): string | null {
  const [first, second] = names;
  if (!first) return null;
  if (!second) return `${first} is typing…`;
  if (names.length === 2) return `${first} and ${second} are typing…`;
  return `${first}, ${second} and ${names.length - 2} more are typing…`;
}
