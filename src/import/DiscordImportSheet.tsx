import { useEffect, useRef, useState } from "react";
import { Image, Modal, Pressable, ScrollView, View } from "react-native";
import { Button, Text, useTheme } from "@gryt/ui-native";
import type { DiscordPackageDm, PackageFiles } from "@gryt/core";
import type { SealedAttachmentKey } from "@gryt/crypto";

import type { MlsSource } from "../mls/session";
import { type ImportProgress, phoneImportDeps, planPhoneImport, readPackage, runDiscordImport, type PhonePlan } from "./discordImport";

type Step = "get" | "pick" | "confirm" | "sending" | "done";

const fmt = (n: number) => n.toLocaleString("en-US");

/** Boards I10 and I11 (GRYT-1965): pick the package, pick the chat, import from here. */
export function DiscordImportSheet({
  open,
  onClose,
  peerName,
  conversationId,
  peer,
  source,
  host,
  getToken,
  seal,
}: {
  open: boolean;
  onClose: () => void;
  peerName: string;
  conversationId: string;
  peer: string;
  source: Pick<MlsSource, "send" | "storeScope"> | null;
  host: string;
  getToken: () => Promise<string | null>;
  seal: (bytes: Uint8Array, about?: { name?: string; mime?: string }) => { ciphertext: Uint8Array; meta: SealedAttachmentKey } | null;
}) {
  const theme = useTheme();
  const [step, setStep] = useState<Step>("get");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dms, setDms] = useState<DiscordPackageDm[]>([]);
  const [picked, setPicked] = useState<DiscordPackageDm | null>(null);
  const [plan, setPlan] = useState<PhonePlan | null>(null);
  const [everything, setEverything] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const files = useRef<PackageFiles | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    if (!open) return;
    setStep("get");
    setError(null);
    setDms([]);
    setPicked(null);
    setPlan(null);
    setEverything(false);
    setProgress(null);
    stopped.current = false;
  }, [open]);

  const close = () => {
    stopped.current = true;
    onClose();
  };

  const choose = async () => {
    setError(null);
    const DocumentPicker = await import("expo-document-picker");
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/zip", "application/x-zip-compressed"], copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    setBusy(true);
    try {
      const read = await readPackage(result.assets[0].uri);
      files.current = read.files;
      setDms(read.dms);
      setPicked(read.dms[0] ?? null);
      setStep("pick");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file couldn’t be read.");
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    if (!picked || !files.current) return;
    setBusy(true);
    try {
      setPlan(await planPhoneImport(files.current, picked));
      setStep("confirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That DM couldn’t be read.");
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!plan || !source) return;
    setStep("sending");
    try {
      const deps = phoneImportDeps({ source, conversationId, peer, host, getToken, seal });
      await runDiscordImport(everything ? plan.messages : plan.textOnly, deps, { paused: () => false, stopped: () => stopped.current }, setProgress);
      if (!stopped.current) setStep("done");
    } catch (e) {
      setError(e instanceof Error ? `The import stopped: ${e.message}` : "The import stopped.");
      setStep("confirm");
    }
  };

  const hint = (t: string, danger = false) => (
    <Text style={{ color: danger ? theme.color.danger : theme.color.muted, fontSize: 14, lineHeight: 20 }}>{t}</Text>
  );
  const bar = (label: string, done: number, total: number) => (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row" }}>
        <Text style={{ flex: 1, color: theme.color.muted, fontSize: 13 }}>{label}</Text>
        <Text style={{ color: theme.color.muted, fontSize: 13 }}>{`${fmt(done)} of ${fmt(total)}`}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.color.surfaceRaised, overflow: "hidden" }}>
        <View style={{ height: 6, width: `${total ? Math.round((done / total) * 100) : 100}%`, backgroundColor: theme.color.accent }} />
      </View>
    </View>
  );
  const option = (title: string, sub: string, on: boolean, pick: () => void) => (
    <Pressable
      onPress={pick}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      style={{ flexDirection: "row", gap: 12, padding: 14, borderRadius: 16, backgroundColor: theme.color.surfaceRaised, borderWidth: on ? 1.5 : 0, borderColor: theme.color.accent }}
    >
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: on ? 6 : 2, borderColor: on ? theme.color.accent : theme.color.border }} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: theme.color.text, fontSize: 15.5, fontWeight: "700" }}>{title}</Text>
        {hint(sub)}
      </View>
    </Pressable>
  );

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <Pressable accessibilityLabel="Close" onPress={close} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(5,6,9,0.55)" }} />
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "85%", borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: theme.color.surface, paddingTop: 18 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 12 }}>
          <Text style={{ color: theme.color.text, fontSize: 20, fontWeight: "700" }}>Import from Discord</Text>

          {step === "get" && (
            <>
              {hint(`Bring your Discord chat with ${peerName} over. Gryt doesn’t log in to Discord: you ask Discord for a copy of your data, and this phone reads it.`)}
              {hint("1. In Discord, open Settings → Data & Privacy → Request all of my data.")}
              {hint("2. Tick Account, Messages and Servers. Discord emails you a .zip, usually within a few days.")}
              {hint("3. Choose the .zip here the day the email comes.")}
              {error ? hint(error, true) : null}
              <Button onPress={() => void choose()} disabled={busy}>{busy ? "Reading the package…" : "Choose the .zip"}</Button>
            </>
          )}

          {step === "pick" && (
            <>
              {hint(`Your package has ${fmt(dms.length)} DMs. The one you talk most in is first.`)}
              {dms.slice(0, 30).map((d) => {
                const on = picked?.channelId === d.channelId;
                return (
                  <Pressable
                    key={d.channelId}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setPicked(d)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, backgroundColor: theme.color.surfaceRaised, borderWidth: on ? 1.5 : 0, borderColor: theme.color.accent }}
                  >
                    {d.avatarUrl ? (
                      <Image source={{ uri: d.avatarUrl }} style={{ width: 32, height: 32, borderRadius: 16 }} />
                    ) : (
                      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surfaceHover }}>
                        <Text style={{ color: theme.color.muted, fontWeight: "800" }}>{d.name[0]?.toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.color.text, fontWeight: "700" }}>{d.name}</Text>
                      <Text style={{ color: theme.color.muted, fontSize: 12.5 }}>{`${fmt(d.messages)} messages from you · ${fmt(d.files)} files`}</Text>
                    </View>
                  </Pressable>
                );
              })}
              {error ? hint(error, true) : null}
              <Button onPress={() => void next()} disabled={!picked || busy}>Next</Button>
            </>
          )}

          {step === "confirm" && plan && (
            <>
              {hint(`Found ${plan.dm.name} in your package: ${fmt(plan.dm.messages)} messages and ${fmt(plan.dm.files)} files.`)}
              {option("Messages now, files on desktop", `${fmt(plan.textOnly.length)} messages import here in a few minutes. The ${fmt(plan.withFiles)} with files come over when you import the same package in Gryt on your computer.`, !everything, () => setEverything(false))}
              {option("Everything on this phone", `All ${fmt(plan.dm.messages)} messages and ${fmt(plan.dm.files)} files. Files download to this phone first, so it needs the space. Wi-Fi is best, and Gryt has to stay open.`, everything, () => setEverything(true))}
              {hint(`Only your side is in your package. ${peerName} sees yours come in, tagged Discord, and can add theirs from their own package.`)}
              {error ? hint(error, true) : null}
              <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <Button tone="neutral" onPress={close}>Cancel</Button>
                <Button onPress={() => void start()} disabled={!source}>Start</Button>
              </View>
            </>
          )}

          {step === "sending" && (
            <>
              {hint("Keep Gryt open until it’s done.")}
              {progress?.sent.done ? hint(`Finishes around ${new Date(Date.now() + ((Date.now() - progress.startedAt) / progress.sent.done) * (progress.sent.total - progress.sent.done)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`) : null}
              {progress ? bar("Messages", progress.messages.done, progress.messages.total) : null}
              {progress?.downloaded.total ? bar("Downloaded", progress.downloaded.done, progress.downloaded.total) : null}
              {progress?.sent.total ? bar("Sent to server", progress.sent.done, progress.sent.total) : null}
              <Button tone="neutral" onPress={close}>Stop</Button>
            </>
          )}

          {step === "done" && plan && (
            <>
              {hint(`${fmt(progress?.messages.done ?? 0)} messages are in.`)}
              {progress?.tooLarge ? hint(`${fmt(progress.tooLarge)} files were too big for this server, and their messages say so. Ask whoever runs it to raise the upload limit to at least ${fmt(Math.ceil(Math.max(...progress.leftOut.map((f) => f.size ?? 0)) / (1024 * 1024)))} MB, then import the same package again.`) : null}
              {progress?.leftOut.map((f) => <Text key={f.url} numberOfLines={1} style={{ color: theme.color.muted, fontSize: 13 }}>{f.name}</Text>)}
              {progress?.missing ? hint(`${fmt(progress.missing)} files couldn’t be downloaded, and their messages say so. A newer package from Discord gets them: import it the same way.`) : null}
              {!everything && plan.withFiles ? hint(`The ${fmt(plan.withFiles)} messages with files are left for your computer. Open Gryt there, go to this chat, and import the same package.`) : null}
              <Button onPress={close}>Done</Button>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
