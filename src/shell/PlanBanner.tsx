import { useState, useSyncExternalStore } from "react";
import { Modal, Pressable, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Button, Text, useTheme } from "@gryt/ui-native";
import { ArchiveIcon } from "phosphor-react-native/src/icons/Archive";
import { ArrowSquareOutIcon } from "phosphor-react-native/src/icons/ArrowSquareOut";
import { CreditCardIcon } from "phosphor-react-native/src/icons/CreditCard";
import { PauseIcon } from "phosphor-react-native/src/icons/Pause";
import { ProhibitIcon } from "phosphor-react-native/src/icons/Prohibit";
import { ShieldWarningIcon } from "phosphor-react-native/src/icons/ShieldWarning";
import { TrashIcon } from "phosphor-react-native/src/icons/Trash";
import { WarningIcon } from "phosphor-react-native/src/icons/Warning";

import { storageFull } from "../chat/storageFull";
import { CLOUD_CONSOLE_URL, type PlanDates, pausedText, planBanner } from "../server/planMode";
import { useCloudUsage } from "../servers/cloudUsage";

type Info = (PlanDates & { plan_mode?: string; is_owner?: boolean }) | undefined | null;
const billing = () => void WebBrowser.openBrowserAsync(`${CLOUD_CONSOLE_URL}/billing`);

/** 6.2 and 6.5: why a Gryt Cloud server is limited, and for the owner the way out. Pressing it opens 6.3. */
export function PlanBanner({ host, info, serverName }: { host?: string; info: Info; serverName: string }) {
  const theme = useTheme();
  const [why, setWhy] = useState(false);
  const owner = info?.is_owner === true;
  const b = planBanner(info?.plan_mode, owner, info ?? {});
  const usage = useCloudUsage(owner && b ? host : undefined);
  if (!b) return null;
  if (!owner)
    return (
      <View accessibilityLabel={`${b.title}. ${b.text}`} style={{ marginHorizontal: theme.space(3), marginBottom: theme.space(2), flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: theme.space(3), paddingVertical: 10, paddingHorizontal: theme.space(5), borderRadius: theme.radius.lg, backgroundColor: theme.scales.danger[2], borderWidth: 1, borderColor: theme.scales.danger[5] }}>
        <Text style={{ color: theme.color.danger, fontSize: 14, fontWeight: "600" }}>{b.title}</Text>
        <Text style={{ color: theme.color.muted, fontSize: 13 }}>{b.text}</Text>
      </View>
    );
  return (
    <>
      <Pressable
        onPress={() => owner && setWhy(true)}
        accessibilityRole={owner ? "button" : "text"}
        accessibilityLabel={`${b.title}. ${b.text}`}
        style={{ marginHorizontal: theme.space(3), marginBottom: theme.space(2), flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: theme.space(3), paddingHorizontal: theme.space(5), borderRadius: theme.radius.lg, backgroundColor: theme.scales.danger[2], borderWidth: 1, borderColor: theme.scales.danger[5] }}
      >
        <View style={tile(theme.scales.danger[3])}>
          <WarningIcon size={18} color={theme.color.danger} weight="fill" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "600" }}>{b.title}</Text>
          <Text style={{ color: theme.color.text, fontSize: 13, textDecorationLine: "underline" }}>{b.text}</Text>
        </View>
        <Button onPress={billing}>Try again</Button>
      </Pressable>
      <WhySheet open={why} onClose={() => setWhy(false)} serverName={serverName} d={info ?? {}} amount={usage?.amount} failedOn={usage?.failedOn} />
    </>
  );
}

const tile = (bg: string) => ({ width: 36, height: 36, borderRadius: 12, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: bg });
const day = (at: number) => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function WhySheet({ open, onClose, serverName, d, amount, failedOn }: { open: boolean; onClose: () => void; serverName: string; d: PlanDates; amount?: number; failedOn?: number | null }) {
  const theme = useTheme();
  const steps = [
    d.plan_read_only_at && { when: `Until ${day(d.plan_read_only_at)}`, what: "Works as normal", c: theme.color.success },
    d.plan_read_only_at && { when: day(d.plan_read_only_at), what: "Read-only", c: theme.color.warning },
    d.plan_paused_at && { when: day(d.plan_paused_at), what: "Paused, deleted after 30 days", c: theme.color.danger },
  ].filter(Boolean) as { when: string; what: string; c: string }[];
  const causes = [
    { icon: <CreditCardIcon size={18} color={theme.color.text} weight="fill" />, text: "The card has expired" },
    { icon: <ShieldWarningIcon size={18} color={theme.color.text} weight="fill" />, text: "Your bank blocked an online payment" },
    { icon: <ProhibitIcon size={18} color={theme.color.text} weight="fill" />, text: "Not enough money on the card" },
  ];
  const label = { color: theme.color.muted, fontSize: 11, fontWeight: "600" as const, letterSpacing: 0.66, textTransform: "uppercase" as const };
  const card = { borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.lg, overflow: "hidden" as const };
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(5,6,9,0.7)" }} onPress={onClose} accessibilityLabel="Close" />
      <View style={{ backgroundColor: theme.color.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: theme.space(5), paddingTop: theme.space(5), paddingBottom: theme.space(9), gap: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
          <View style={tile(theme.scales.danger[2])}>
            <WarningIcon size={18} color={theme.color.danger} weight="fill" />
          </View>
          <Text style={{ flex: 1, color: theme.color.text, fontSize: 16, fontWeight: "700" }}>Your card was declined</Text>
        </View>
        <View style={[card, { paddingVertical: theme.space(3), paddingHorizontal: theme.space(4), gap: 2 }]}>
          <Text style={{ color: theme.color.muted, fontSize: 13 }}>What happened</Text>
          <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "600" }}>
            {amount && failedOn ? `€${amount} for ${serverName} didn’t go through on ${new Date(failedOn).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.` : `The payment for ${serverName} didn’t go through.`}
          </Text>
        </View>
        {steps.length > 0 ? (
          <>
            <Text style={label}>What happens next</Text>
            <View style={{ gap: 6 }}>
              {steps.map((s) => (
                <View key={s.what} style={{ gap: 6 }}>
                  <View style={{ height: 4, borderRadius: 999, backgroundColor: s.c }} />
                  <Text style={{ color: theme.color.text, fontSize: 13, fontWeight: "700" }}>{s.when}</Text>
                  <Text style={{ color: theme.color.muted, fontSize: 12 }}>{s.what}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
        <Text style={label}>Common causes</Text>
        <View style={card}>
          {causes.map((c, i) => (
            <View key={c.text} style={{ minHeight: 60, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: theme.space(3), paddingHorizontal: theme.space(4), borderTopWidth: i ? 1 : 0, borderTopColor: theme.color.surfaceHover }}>
              <View style={tile(theme.color.surfaceHover)}>{c.icon}</View>
              <Text style={{ flex: 1, color: theme.color.text, fontSize: 14, fontWeight: "600" }}>{c.text}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button size="large" tone="ghost" style={{ flex: 1 }} onPress={onClose}>
            Close
          </Button>
          <Button size="large" style={{ flex: 1 }} onPress={billing}>
            Try again
          </Button>
        </View>
      </View>
    </Modal>
  );
}

/** 6.6 (members) and 6.7 (owner): a paused Gryt Cloud server, in place of its messages. */
export function PausedServer({ host, info, serverName, onLeave }: { host?: string; info: Info; serverName: string; onLeave: () => void }) {
  const theme = useTheme();
  const owner = info?.is_owner === true;
  const amount = useCloudUsage(owner ? host : undefined)?.amount;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space(6), gap: theme.space(3.5) }}>
      <View style={{ width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: theme.scales.danger[2] }}>
        <PauseIcon size={26} color={theme.color.danger} weight="fill" />
      </View>
      <Text style={{ color: theme.color.text, fontSize: 22, fontWeight: "700", textAlign: "center" }}>{serverName} is paused</Text>
      <Text style={{ color: theme.color.muted, fontSize: 14, textAlign: "center" }}>{pausedText(owner, info ?? {})}</Text>
      <View style={{ flexDirection: "row", gap: theme.space(2.5), paddingTop: theme.space(1.5) }}>
        {owner ? (
          <>
            <Button tone="neutral" onPress={() => void WebBrowser.openBrowserAsync(`${CLOUD_CONSOLE_URL}/servers`)}>
              Download
            </Button>
            <Button onPress={billing} endIcon={<ArrowSquareOutIcon size={14} color={theme.color.onAccent} />}>
              {amount ? `Renew · €${amount}` : "Renew"}
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
    <View style={{ marginHorizontal: theme.space(3), marginBottom: theme.space(2), flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: theme.space(3), paddingVertical: theme.space(3), paddingHorizontal: 14, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surfaceRaised }}>
      <View style={{ width: 36, height: 36, borderRadius: theme.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: theme.scales.danger[2] }}>
        <ArchiveIcon size={18} color={theme.color.danger} weight="fill" />
      </View>
      <View style={{ flex: 1, minWidth: 140 }}>
        <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "600" }}>{serverName} is out of space</Text>
        <Text style={{ color: theme.color.muted, fontSize: 13 }}>
          {gb(Math.min(full.used, full.limit))} / {gb(full.limit)} GB
        </Text>
      </View>
      {isOwner ? (
        <Button onPress={() => void WebBrowser.openBrowserAsync(`${CLOUD_CONSOLE_URL}/servers/${encodeURIComponent(host)}`)}>
          Upgrade
        </Button>
      ) : null}
      <Button tone="neutral" style={{ backgroundColor: theme.color.surfaceHover }} onPress={() => router.push("/server-settings/storage" as never)}>
        Free up space
      </Button>
    </View>
  );
}

const gone = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** 7.3: a deleted Gryt Cloud server, in place of "can't reach it". */
export function ServerGone({ serverName, deletedOn, onRemove, onStartNew }: { serverName: string; deletedOn: string; onRemove: () => void; onStartNew: () => void }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space(6), gap: theme.space(3.5) }}>
      <View style={{ width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surfaceHover }}>
        <TrashIcon size={26} color={theme.color.muted} weight="fill" />
      </View>
      <Text style={{ color: theme.color.text, fontSize: 22, fontWeight: "700", textAlign: "center" }}>{serverName} is gone</Text>
      <Text style={{ color: theme.color.muted, fontSize: 14, textAlign: "center" }}>Deleted on {gone(deletedOn)}.</Text>
      <View style={{ flexDirection: "row", gap: theme.space(2.5), paddingTop: theme.space(1.5) }}>
        <Button tone="neutral" onPress={onRemove}>
          Remove from list
        </Button>
        <Button onPress={onStartNew}>Start a new server</Button>
      </View>
    </View>
  );
}
