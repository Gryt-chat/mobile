import {
  type DiscordPackageDm,
  type DiscordPackageMessage,
  type ImportDeps,
  type ImportFileStore,
  type ImportProgress,
  isDiscordPackage,
  listDiscordDms,
  openZipBytes,
  type PackageFiles,
  readDiscordDm,
  runDiscordImport,
  retryAfterMs,
} from "@gryt/core";
import type { SealedAttachmentKey } from "@gryt/crypto";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";

import { uploadAttachment } from "../chat/upload";
import type { MlsSource } from "../mls/session";

/* The phone's half of GRYT-1965, on @gryt/core's job. "Messages now" leaves messages with files
   for the desktop, which sends them with the files under the same ids, so the two never clash. */

export async function readPackage(uri: string): Promise<{ files: PackageFiles; dms: DiscordPackageDm[] }> {
  const files = openZipBytes(await new File(uri).bytes());
  if (!isDiscordPackage(files.names)) throw new Error("That zip isn’t a Discord data package. It should have a Messages folder in it.");
  const dms = await listDiscordDms(files);
  if (!dms.length) throw new Error("There are no DMs with messages in that package. Was Messages ticked when you asked for it?");
  return { files, dms };
}

export interface PhonePlan {
  dm: DiscordPackageDm;
  messages: DiscordPackageMessage[];
  textOnly: DiscordPackageMessage[];
  withFiles: number;
}

export async function planPhoneImport(files: PackageFiles, dm: DiscordPackageDm): Promise<PhonePlan> {
  const messages = await readDiscordDm(files, dm.channelId);
  const textOnly = messages.filter((m) => m.attachments.length === 0);
  return { dm, messages, textOnly, withFiles: messages.length - textOnly.length };
}

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", pdf: "application/pdf" };
const typeOf = (url: string) => TYPES[url.split("?")[0].split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

/** FNV-1a, so a link's file name stays the same across runs and a second run finds it. */
function fileNameFor(url: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) h = Math.imul(h ^ url.charCodeAt(i), 0x01000193);
  return `${(h >>> 0).toString(16)}-${url.length}`;
}

/** Downloads wait in the app's cache folder until they're uploaded. */
export function phoneFileStore(): ImportFileStore {
  const dir = new Directory(Paths.cache, "discord-import");
  if (!dir.exists) dir.create();
  const at = (url: string) => new File(dir, fileNameFor(url));
  return {
    has: async (url) => at(url).exists,
    put: async (url, file) => at(url).write(file.bytes),
    take: async (url) => (at(url).exists ? { type: typeOf(url), bytes: await at(url).bytes() } : null),
    drop: async (url) => {
      if (at(url).exists) at(url).delete();
    },
  };
}

export function phoneImportDeps({
  source,
  conversationId,
  peer,
  host,
  getToken,
  seal,
}: {
  source: Pick<MlsSource, "send" | "storeScope">;
  conversationId: string;
  peer: string;
  host: string;
  getToken: () => Promise<string | null>;
  seal: (bytes: Uint8Array, about?: { name?: string; mime?: string }) => { ciphertext: Uint8Array; meta: SealedAttachmentKey } | null;
}): ImportDeps {
  return {
    send: (content) => source.send(conversationId, peer, content),
    download: async (url) => {
      const res = await fetch(url);
      if (res.status === 429) return { retryAfterMs: retryAfterMs(res.headers.get("retry-after")) };
      if (!res.ok) return null;
      return { type: res.headers.get("content-type") || typeOf(url), bytes: new Uint8Array(await res.arrayBuffer()) };
    },
    upload: async (file) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in to this server.");
      const scratch = new File(new Directory(Paths.cache, "discord-import"), `up-${Date.now()}-${file.name}`);
      scratch.writeSync(file.bytes);
      try {
        const { fileId, meta } = await uploadAttachment(host, token, { uri: scratch.uri, mime: file.type, name: file.name }, undefined, seal);
        if (!meta) throw new Error("The file was uploaded without its key.");
        return { id: fileId, key: meta };
      } catch (e) {
        const { status, retryAfter } = e as { status?: number; retryAfter?: string | null };
        if (status === 429) return { retryAfterMs: retryAfterMs(retryAfter ?? null) };
        if (status === 413) return { tooLarge: true };
        throw e;
      } finally {
        if (scratch.exists) scratch.delete();
      }
    },
    store: phoneFileStore(),
    transfersAtOnce: 4,
    alreadyHas: async (id) => {
      const { openLocalArchive } = await import("../archive/localArchive");
      return !!(await (await openLocalArchive()).messages.get(source.storeScope, conversationId, id));
    },
    bundles: true,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    newId: () => Crypto.randomUUID(),
  };
}

export type { ImportProgress };
export { runDiscordImport };
