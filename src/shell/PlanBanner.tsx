import { useState, useSyncExternalStore } from "react";
import { Modal, Pressable, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Button, Text, useTheme } from "@gryt/ui-native";
import { ArchiveIcon } from "phosphor-react-native/src/icons/Archive";
import { ArrowSquareOutIcon } from "phosphor-react-native/src/icons/ArrowSquareOut";
import { ClockIcon } from "phosphor-react-native/src/icons/Clock";
import { PauseIcon } from "phosphor-react-native/src/icons/Pause";
import { ProhibitIcon } from "phosphor-react-native/src/icons/Prohibit";
import { ShieldWarningIcon } from "phosphor-react-native/src/icons/ShieldWarning";
import { WarningIcon } from "phosphor-react-native/src/icons/Warning";

import { storageFull } from "../chat/storageFull";
import { CLOUD_CONSOLE_URL, type PlanDates, pausedText, planBanner } from "../server/planMode";

type Info = (PlanDates & { plan_mode?: string; is_owner?: boolean }) | undefined | null;
const billing = () => void WebBrowser.openBrowserAsync(`${CLOUD_CONSOLE_URL}/billing`);

/** 6.2 and 6.5: why a Gryt Cloud server is limited, and for the owner the way out. Pressing it opens 6.3. */
export function PlanBanner({ info, serverName }: { info: Info; serverName: string }) {
  const theme = useTheme();
  const [why, setWhy] = useState(false);
  const owner = info?.is_owner === true;
  const b = planBanner(info?.plan_mode, owner, info ?? {});
  if (!b) return null;
  return (
    <>
      <Pressable
        onPress={() => owner && setWhy(true)}
        accessibilityRole={owner ? "button" : "text"}
        accessibilityLabel={`${b.title}. ${b.text}`}
        style={{ marginHorizontal: theme.space(3), marginBottom: theme.space(2), flexDirection: "row", alignItems: "center", gap: theme.space(3), padding: theme.space(3), borderRadius: theme.radius.lg, backgroundColor: theme.scales.danger[2], borderWidth: 1, borderColor: theme.scales.danger[5] }}
      >
        <WarningIcon size={18} color={theme.color.danger} weight="fill" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "700" }}>{b.title}</Text>
          <Text style={{ color: theme.color.muted, fontSize: 12.5 }}>{b.text}</Text>
        </View>
        {owner ? (
          <Button size="small" onPress={billing}>
            Try again
          </Button>
        ) : null}
      </Pressable>
      <WhySheet open={why} onClose={() => setWhy(false)} serverName={serverName} />
    </>
  );
}

function WhySheet({ open, onClose, serverName }: { open: boolean; onClose: () => void; serverName: string }) {
  const theme = useTheme();
  const causes = [
    { icon: <ClockIcon size={18} color={theme.color.muted} />, text: "The card has expired" },
    { icon: <ShieldWarningIcon size={18} color={theme.color.muted} />, text: "Your bank blocked an online payment" },
    { icon: <ProhibitIcon size={18} color={theme.color.muted} />, text: "Not enough money on the card" },
  ];
  const label = { color: theme.color.muted, fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.66, textTransform: "uppercase" as const };
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(5,6,9,0.7)" }} onPress={onClose} accessibilityLabel="Close" />
      <View style={{ backgroundColor: theme.color.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: theme.space(5), paddingBottom: theme.space(9), gap: theme.space(4) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
          <WarningIcon size={20} color={theme.color.danger} weight="fill" />
          <Text style={{ flex: 1, color: theme.color.text, fontSize: 19, fontWeight: "700" }}>Your card was declined</Text>
        </View>
        <View style={{ gap: 4 }}>
          <Text style={label}>What happened</Text>
          <Text style={{ color: theme.color.text, fontSize: 15 }}>The payment for {serverName} didn’t go through.</Text>
        </View>
        <View style={{ gap: theme.space(2) }}>
          <Text style={label}>Common causes</Text>
          {causes.map((c) => (
            <View key={c.text} style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
              {c.icon}
              <Text style={{ color: theme.color.text, fontSize: 15 }}>{c.text}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: theme.space(2) }}>
          <Button tone="ghost" style={{ flex: 1 }} onPress={onClose}>
            Close
          </Button>
          <Button style={{ flex: 1 }} onPress={billing}>
            Try again
          </Button>
        </View>
      </View>
    </Modal>
  );
}

/** 6.6 (members) and 6.7 (owner): a paused Gryt Cloud server, in place of its messages. */
export function PausedServer({ info, serverName, onLeave }: { info: Info; serverName: string; onLeave: () => void }) {
  const theme = useTheme();
  const owner = info?.is_owner === true;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space(6), gap: theme.space(3.5) }}>
      <View style={{ width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: theme.scales.danger[2] }}>
        <PauseIcon size={26} color={theme.color.danger} weight="fill" />
      </View>
      <Text style={{ color: theme.color.text, fontSize: 20, fontWeight: "700", textAlign: "center" }}>{serverName} is paused</Text>
      <Text style={{ color: theme.color.muted, fontSize: 15, textAlign: "center" }}>{pausedText(owner, info ?? {})}</Text>
      <View style={{ flexDirection: "row", gap: theme.space(2.5), paddingTop: theme.space(1.5) }}>
        {owner ? (
          <>
            <Button tone="neutral" onPress={() => void WebBrowser.openBrowserAsync(`${CLOUD_CONSOLE_URL}/servers`)}>
              Download
            </Button>
            <Button onPress={billing} endIcon={<ArrowSquareOutIcon size={14} color={theme.color.onAccent} />}>
              Renew
            </Button>
          </>
        ) : (
          <Button tone="neutral" onPress={onLeave}>
            Leave server
          </Button>
        )}
      </View>
    </View>
  );
}

/** 4.12: shown above the composer once an upload is refused for space. */
export function StorageFullLine({ host, serverName, isOwner }: { host: string; serverName: string; isOwner: boolean }) {
  const theme = useTheme();
  const full = useSyncExternalStore(storageFull.subscribe, () => storageFull.get(host));
  if (!full) return null;
  const gb = (b: number) => Math.round(b / 1024 ** 3);
  return (
    <View style={{ marginHorizontal: theme.space(3), marginBottom: theme.space(2), flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: theme.space(3), padding: theme.space(3), borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface }}>
      <View style={{ width: 36, height: 36, borderRadius: theme.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: theme.scales.danger[2] }}>
        <ArchiveIcon size={18} color={theme.color.danger} weight="fill" />
      </View>
      <View style={{ flex: 1, minWidth: 140 }}>
        <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "700" }}>{serverName} is out of space</Text>
        <Text style={{ color: theme.color.muted, fontSize: 12.5 }}>
          {gb(Math.min(full.used, full.limit))} / {gb(full.limit)} GB
        </Text>
      </View>
      {isOwner ? (
        <Button size="small" onPress={() => void WebBrowser.openBrowserAsync(`${CLOUD_CONSOLE_URL}/servers/${encodeURIComponent(host)}`)}>
          Upgrade
        </Button>
      ) : null}
      <Button size="small" tone="neutral" onPress={() => router.push("/server-settings/storage" as never)}>
        Free up space
      </Button>
    </View>
  );
}
