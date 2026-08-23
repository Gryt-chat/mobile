/**
 * Who is typing, and when to say that you are.
 *
 * The server has had `chat:typing` and `chat:stop_typing` since the beginning
 * and the phone neither emitted nor listened, so a channel with two people in
 * it looked the same whether or not one of them was mid-sentence.
 *
 * All of it is timestamps rather than timers. The desktop keeps a
 * `setTimeout` per person and clears it on every keystroke they make; that
 * works, and on a phone it is a pile of timers that a backgrounded app stops
 * running and then fires all at once on resume. Recording *when* somebody last
 * said they were typing and asking who is still within the window is the same
 * answer without anything to leak — and it is a pure function, which the timer
 * version is not.
 */

/**
 * How often to say it while somebody keeps typing.
 *
 * The server's rate limit is 30 in 10 seconds and it drops what it does not
 * allow, silently. Three seconds is what the desktop uses and is well inside
 * that with room for the odd burst.
 */
export const TYPING_THROTTLE_MS = 3_000;

/**
 * How long a claim stands without being renewed.
 *
 * Eight seconds, which is the server's own `TYPING_TIMEOUT_MS`. **Matching it
 * is the point.** The server broadcasts a stop of its own when its timer
 * expires, so a shorter window here would hide somebody the server still
 * considers to be typing, and a longer one would leave the line up after the
 * stop arrived. Either way the two would disagree about the same person.
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
 * Who is still within the window.
 *
 * Also the thing that makes a dropped `chat:stop_typing` harmless: the line
 * goes away on its own eight seconds later rather than staying up until the
 * channel is closed.
 */
export function activeTypers(typers: Typer[], now: number): Typer[] {
  return typers.filter((t) => now - t.at < TYPING_TIMEOUT_MS);
}

/**
 * Whether to put another `chat:typing` on the wire.
 *
 * `null` means not currently claiming to type, so the first keystroke always
 * emits — waiting three seconds to say it would mean the shortest messages
 * never showed at all.
 */
export function shouldEmitTyping(lastEmit: number | null, now: number): boolean {
  return lastEmit === null || now - lastEmit >= TYPING_THROTTLE_MS;
}

/**
 * The sentence.
 *
 * Names up to two, then a count, which is where every client that draws this
 * ends up: three names is longer than the message being typed and the row is
 * one line.
 */
export function typingLabel(names: string[]): string | null {
  const [first, second] = names;
  if (!first) return null;
  if (!second) return `${first} is typing…`;
  if (names.length === 2) return `${first} and ${second} are typing…`;
  return `${first}, ${second} and ${names.length - 2} more are typing…`;
}
