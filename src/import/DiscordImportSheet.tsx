import { useEffect, useRef, useState } from "react";
import { Image, Modal, Pressable, ScrollView, View } from "react-native";
import { Button, Text, useTheme } from "@gryt/ui-native";
import type { DiscordPackageDm, PackageFiles } from "@gryt/core";

import type { MlsSource } from "../mls/session";
import { planPhoneImport, readPackage, sendTextImport, type PhonePlan } from "./discordImport";

type Step = "get" | "pick" | "confirm" | "sending" | "done";

const fmt = (n: number) => n.toLocaleString("en-US");

/** Boards I10 and I11 (GRYT-1965): pick the package, pick the chat, send the messages from here. */
export function DiscordImportSheet({
  open,
  onClose,
  peerName,
  conversationId,
  peer,
  source,
}: {
  open: boolean;
  onClose: () => void;
  peerName: string;
  conversationId: string;
  peer: string;
  source: Pick<MlsSource, "send"> | null;
}) {
  const theme = useTheme();
  const [step, setStep] = useState<Step>("get");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dms, setDms] = useState<DiscordPackageDm[]>([]);
  const [picked, setPicked] = useState<DiscordPackageDm | null>(null);
  const [plan, setPlan] = useState<PhonePlan | null>(null);
  const [sent, setSent] = useState(0);
  const files = useRef<PackageFiles | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    if (!open) return;
    setStep("get");
    setError(null);
    setDms([]);
    setPicked(null);
    setPlan(null);
    setSent(0);
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
      await sendTextImport(source, conversationId, peer, plan, setSent, () => stopped.current);
      if (!stopped.current) setStep("done");
    } catch (e) {
      setError(e instanceof Error ? `The import stopped: ${e.message}` : "The import stopped.");
      setStep("confirm");
    }
  };

  const hint = (t: string, danger = false) => (
    <Text style={{ color: danger ? theme.color.danger : theme.color.muted, fontSize: 14, lineHeight: 20 }}>{t}</Text>
  );
  const option = (title: string, sub: string, on: boolean, enabled: boolean) => (
    <View
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled: !enabled }}
      style={{ flexDirection: "row", gap: 12, padding: 14, borderRadius: 16, opacity: enabled ? 1 : 0.5, backgroundColor: theme.color.surfaceRaised, borderWidth: on ? 1.5 : 0, borderColor: theme.color.accent }}
    >
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: on ? 6 : 2, borderColor: on ? theme.color.accent : theme.color.border }} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: theme.color.text, fontSize: 15.5, fontWeight: "700" }}>{title}</Text>
        {hint(sub)}
      </View>
    </View>
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
              {option("Messages now, files on desktop", `${fmt(plan.textOnly.length)} messages import here in a few minutes. The ${fmt(plan.withFiles)} with files come over when you import the same package in Gryt on your computer.`, true, true)}
              {option("Everything on this phone", "Coming later.", false, false)}
              {hint(`Only your side is in your package. ${peerName} sees yours come in, tagged Discord, and can add theirs from their own package.`)}
              {error ? hint(error, true) : null}
              <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <Button tone="neutral" onPress={close}>Cancel</Button>
                <Button onPress={() => void start()} disabled={!source}>Start</Button>
              </View>
            </>
          )}

          {step === "sending" && plan && (
            <>
              {hint(`Importing ${fmt(sent)} of ${fmt(plan.textOnly.length)} messages. Keep Gryt open until it’s done.`)}
              <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.color.surfaceRaised, overflow: "hidden" }}>
                <View style={{ height: 6, width: `${plan.textOnly.length ? Math.round((sent / plan.textOnly.length) * 100) : 100}%`, backgroundColor: theme.color.accent }} />
              </View>
              <Button tone="neutral" onPress={close}>Stop</Button>
            </>
          )}

          {step === "done" && plan && (
            <>
              {hint(`${fmt(sent)} messages are in.`)}
              {plan.withFiles ? hint(`The ${fmt(plan.withFiles)} messages with files are left for your computer. Open Gryt there, go to this chat, and import the same package.`) : null}
              <Button onPress={close}>Done</Button>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
