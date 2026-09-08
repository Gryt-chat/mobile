import type { IncomingShare } from "./incoming";

/**
 * What is about to be shared, in a line — on Android the share sheet can hand over
 * something quite different from what somebody tapped. Pure, because every bug in a
 * sentence like this is an off-by-one or an "1 photos".
 */
export function summarise(share: IncomingShare): string {
  const files = share.files.length;

  if (files === 0) return share.text ?? "";

  const kind = describe(share.files.map((file) => file.mime));
  const noun = files === 1 ? kind.one : kind.many;
  const count = `${files} ${noun}`;

  /* The text alongside, when there is some: several apps send a caption with the file,
   * and dropping it here would look like dropping it altogether. */
  return share.text ? `${count} — ${share.text}` : count;
}

/**
 * A noun for a set of files: specific when they are all the same kind, and "file" when
 * mixed — "2 photos and a PDF" is not worth the code.
 */
function describe(mimes: string[]): { one: string; many: string } {
  const all = (prefix: string) => mimes.every((mime) => mime.startsWith(prefix));

  if (all("image/")) return { one: "photo", many: "photos" };
  if (all("video/")) return { one: "video", many: "videos" };
  if (all("audio/")) return { one: "audio file", many: "audio files" };
  return { one: "file", many: "files" };
}
