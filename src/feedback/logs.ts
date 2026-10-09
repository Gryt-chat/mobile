/**
 * The tail of the app's own log, so a bug report can carry it. The desktop's recorder,
 * ported. **Nothing is redacted, and nothing is sent unless the switch is on.**
 */

const MAX_LINES = 300;
const MAX_LINE_CHARS = 500;

const lines: string[] = [];

/** Drop the styling from a `console.warn("%cthing", "color:…")` call. */
function unstyle(args: unknown[]): unknown[] {
  const [first, ...rest] = args;
  if (typeof first !== "string" || !first.includes("%c")) return args;

  const styles = (first.match(/%c/g) ?? []).length;
  return [first.replace(/%c/g, ""), ...rest.slice(styles)];
}

export function record(level: "warn" | "error", args: unknown[]): void {
  const text = unstyle(args)
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try {
        return JSON.stringify(a);
      } catch {
        // A circular object's type is more use than a TypeError from inside the logger.
        return Object.prototype.toString.call(a);
      }
    })
    .join(" ");

  const stamped = `${new Date().toISOString()} ${level} ${text}`;
  lines.push(stamped.length > MAX_LINE_CHARS ? `${stamped.slice(0, MAX_LINE_CHARS)}…` : stamped);
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
}

let installed = false;

/** Start recording, once, as early as the root layout can. Wraps rather than replaces. */
export function captureLogs(): void {
  if (installed) return;
  installed = true;

  for (const level of ["warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try {
        record(level, args);
      } catch {
        // Never let the recorder break the thing it's recording.
      }
      original(...args);
    };
  }
}

/** What a report attaches. A copy, so it can't change under the sender. */
export function recentLogs(): string[] {
  return [...lines];
}
