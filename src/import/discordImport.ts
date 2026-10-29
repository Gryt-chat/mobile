import { type DiscordPackageDm, type DiscordPackageMessage, importBatches, isDiscordPackage, listDiscordDms, openZipBytes, type PackageFiles, readDiscordDm } from "@gryt/core";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";

import type { MlsSource } from "../mls/session";

/* The phone's half of GRYT-1965: messages only. A message with files is left for the desktop,
   which sends it with them under the same id, so the two never clash. */

export const importId = (discordId: string) => `discord-${discordId}`;

export async function readPackage(uri: string): Promise<{ files: PackageFiles; dms: DiscordPackageDm[] }> {
  const files = openZipBytes(await new File(uri).bytes());
  if (!isDiscordPackage(files.names)) throw new Error("That zip isn’t a Discord data package. It should have a Messages folder in it.");
  const dms = await listDiscordDms(files);
  if (!dms.length) throw new Error("There are no DMs with messages in that package. Was Messages ticked when you asked for it?");
  return { files, dms };
}

export interface PhonePlan {
  dm: DiscordPackageDm;
  textOnly: DiscordPackageMessage[];
  withFiles: number;
}

export async function planPhoneImport(files: PackageFiles, dm: DiscordPackageDm): Promise<PhonePlan> {
  const messages = await readDiscordDm(files, dm.channelId);
  const textOnly = messages.filter((m) => m.attachments.length === 0);
  return { dm, textOnly, withFiles: messages.length - textOnly.length };
}

/** `mls:send` allows about one send every two seconds sustained (RL_SEND in the server). */
const SEND_GAP_MS = 2_000;

export async function sendTextImport(
  source: Pick<MlsSource, "send">,
  conversationId: string,
  peer: string,
  plan: PhonePlan,
  progress: (done: number) => void,
  stopped: () => boolean,
): Promise<number> {
  const entries = plan.textOnly.map((m) => ({ id: importId(m.discordId), sentAt: m.sentAt, text: m.text }));
  let done = 0;
  for (const batch of importBatches(entries, () => Crypto.randomUUID())) {
    if (stopped()) break;
    await source.send(conversationId, peer, batch);
    done += batch.entries.length;
    progress(done);
    await new Promise((r) => setTimeout(r, SEND_GAP_MS));
  }
  return done;
}
