import type { IncomingShare } from "./incoming";

/**
 * What is about to be shared, in a line.
 *
 * The picker asks "where?", and it should be obvious what is going there —
 * especially on Android, where the share sheet can hand over something quite
 * different from what somebody thought they tapped. Showing the text or naming
 * the files is the cheapest possible confirmation.
 *
 * Pure and separate from the sheet so the counting and pluralisation can be
 * tested; every bug in a sentence like this is an off-by-one or an "1 photos".
 */
export function summarise(share: IncomingShare): string {
  const files = share.files.length;

  if (files === 0) return share.text ?? "";

  const kind = describe(share.files.map((file) => file.mime));
  const noun = files === 1 ? kind.one : kind.many;
  const count = `${files} ${noun}`;

  /* The text alongside, when there is some. Several apps send a caption or a
   * page title with the file, and dropping it here would make the picker look
   * like it had dropped it altogether. */
  return share.text ? `${count} — ${share.text}` : count;
}

/**
 * A noun for a set of files.
 *
 * Specific when they are all the same kind, and "file" when they are mixed —
 * "3 photos" is worth saying and "2 photos and a PDF" is not worth the code.
 */
function describe(mimes: string[]): { one: string; many: string } {
  const all = (prefix: string) => mimes.every((mime) => mime.startsWith(prefix));

  if (all("image/")) return { one: "photo", many: "photos" };
  if (all("video/")) return { one: "video", many: "videos" };
  if (all("audio/")) return { one: "audio file", many: "audio files" };
  return { one: "file", many: "files" };
}
