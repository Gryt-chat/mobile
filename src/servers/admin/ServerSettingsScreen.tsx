import { type ReactNode, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Chip, Meter, Surface, Text, useTheme, useToast } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
import { CloudIcon } from "phosphor-react-native/src/icons/Cloud";
import { FlagIcon } from "phosphor-react-native/src/icons/Flag";
import { LinkIcon } from "phosphor-react-native/src/icons/Link";
import { ShieldCheckIcon } from "phosphor-react-native/src/icons/ShieldCheck";
import { SmileyWinkIcon } from "phosphor-react-native/src/icons/SmileyWink";

import { readableSize } from "../../chat/files";
import { useServerConnection } from "../../connection/ConnectionsProvider";
import { canOnServer } from "../../connection/permissions";
import { useMembers } from "../../connection/MembersProvider";
import { startOwnerTour } from "../../onboarding/ownerTourState";
import { TourTarget } from "../../onboarding/tourTargets";
import { useShell } from "../../shell/ShellContext";
import { useTabBarSpace } from "../../shell/TabBar";
import { GRYT_FONTS } from "../../ui/fonts";
import { useCloudUsage } from "../cloudUsage";
import { useServerJoinPolicy } from "../joinPolicy";
import { ServerIcon } from "../ServerIcon";
import { copyInviteLink } from "../useServerMenu";
import { type AdminPage, type AdminSection, visibleAdminSections, visiblePages } from "./sections";
import { ask, type StorageOverview } from "./storageApi";

const SECTION_META: Record<AdminSection, { label: string; hint: string; icon: typeof LinkIcon }> = {
  invites: { label: "Invites", hint: "Codes that let people in", icon: LinkIcon },
  roles: { label: "Roles", hint: "Roles, channel permissions and folders", icon: ShieldCheckIcon },
  emoji: { label: "Emoji", hint: "This server's own emoji", icon: SmileyWinkIcon },
  moderation: { label: "Moderation", hint: "Bans", icon: FlagIcon },
  hosting: { label: "Hosting", hint: "Plan, storage and transfer", icon: CloudIcon },
};

const size = (n: number) => readableSize(n) ?? "0 B";
const spaced = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

function Screen({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <View style={{ paddingTop: insets.top + theme.space(1), paddingBottom: theme.space(2), paddingHorizontal: theme.space(2), flexDirection: "row", alignItems: "center", gap: theme.space(2), borderBottomWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={({ pressed }) => ({ width: 40, height: 40, borderRadius: theme.radius.full, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised })}
        >
          <CaretLeftIcon size={20} color={theme.color.text} weight="bold" />
        </Pressable>
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700", flex: 1 }}>{title}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: theme.space(4), gap: theme.space(4), paddingBottom: tabBarSpace + 48 }}>{children}</ScrollView>
    </View>
  );
}

function Row({ label, hint, icon: Icon, onPress }: { label: string; hint: string; icon?: typeof LinkIcon; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Surface level="surface" bordered radius="lg" style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3), padding: theme.space(3) }}>
        {Icon ? <Icon size={20} color={theme.color.muted} weight="fill" /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: theme.color.text, fontSize: 15, fontWeight: "600" }}>{label}</Text>
          <Text style={{ color: theme.color.muted, fontSize: 12 }}>{hint}</Text>
        </View>
        <CaretRightIcon size={16} color={theme.color.muted} />
      </Surface>
    </Pressable>
  );
}

function Label({ children }: { children: string }) {
  const theme = useTheme();
  return <Text style={{ color: theme.color.muted, fontSize: 11, fontWeight: "600", letterSpacing: 0.9 }}>{children.toUpperCase()}</Text>;
}

function Stat({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <Surface level="surface" bordered radius="lg" style={{ flex: 1, padding: theme.space(3), gap: theme.space(1) }}>
      <Label>{label}</Label>
      <Text style={{ color: theme.color.text, fontSize: 20, fontWeight: "700" }}>{value}</Text>
    </Surface>
  );
}

function openSection(section: AdminSection, pages: AdminPage[]) {
  const [only] = pages;
  if (pages.length === 1 && only) router.push(only.route as never);
  else router.push({ pathname: "/server-settings/section/[id]", params: { id: section } } as never);
}

/** The first screen of server settings: what the server is, how full, what needs you, then the tabs. The desktop's Overview. */
export function ServerSettingsScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { state, socket, getAccessToken } = useServerConnection();
  const info = state.status === "ready" ? state.details : undefined;
  const { server } = useShell();
  const host = server?.host ?? "";
  const cloud = useCloudUsage(server?.host);
  const sections = visibleAdminSections(info, !!cloud);
  const { all } = useMembers();
  const shareable = useServerJoinPolicy(server?.host) === "open";
  const [messages, setMessages] = useState<number | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [reports, setReports] = useState(0);
  const [storage, setStorage] = useState<StorageOverview | null>(null);
  const canStorage = visiblePages("hosting", info).length > 0;

  useEffect(() => {
    if (!socket) return;
    const onSettings = (s: { messageCount?: number }) => {
      if (typeof s?.messageCount === "number") setMessages(s.messageCount);
    };
    const onRequests = (p: { requests?: { id?: string }[] }) => setWaiting(p?.requests?.length ?? 0);
    const onReports = (p: { reports?: { id?: string }[]; userReports?: { id?: string }[] }) => setReports((p?.reports?.length ?? 0) + (p?.userReports?.length ?? 0));
    socket.on("server:settings", onSettings);
    socket.on("server:joinRequests", onRequests);
    socket.on("reports:list", onReports);
    socket.emit("server:settings:get");
    void getAccessToken().then((accessToken) => {
      if (!accessToken) return;
      if (canOnServer(info, "manage_join_requests")) socket.emit("server:joinRequests:list", { accessToken });
      if (canOnServer(info, "view_reports")) socket.emit("reports:list", { accessToken });
    });
    return () => {
      socket.off("server:settings", onSettings);
      socket.off("server:joinRequests", onRequests);
      socket.off("reports:list", onReports);
    };
  }, [socket, getAccessToken, info]);

  useEffect(() => {
    if (!socket || cloud || !canStorage) return;
    ask<StorageOverview>(socket, "storage:overview", {}).then(setStorage).catch(() => {});
  }, [socket, cloud, canStorage]);

  const used = cloud ? cloud.storage.used : storage?.used ?? null;
  const limit = cloud ? cloud.storage.limit : storage?.limit ?? null;
  const notOnPhone = () => toast.show({ title: "Not on the phone yet", description: "Open server settings in the desktop app for this." });
  const needs = [
    waiting > 0 && { t: `${waiting} waiting to join`, v: "Members" },
    reports > 0 && { t: `${reports} open ${reports === 1 ? "report" : "reports"}`, v: "Moderation" },
  ].filter(Boolean) as { t: string; v: string }[];

  return (
    <Screen title="Server settings">
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
        <ServerIcon host={host} name={server?.name ?? host} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700" }} numberOfLines={1}>{server?.name || host}</Text>
          <Text style={{ color: theme.color.muted, fontSize: 13, fontFamily: GRYT_FONTS.mono }} numberOfLines={1}>{host}</Text>
        </View>
        {cloud ? <Chip label={`${cloud.plan.name} plan`} tone="accent" /> : null}
      </View>
      <Button size="large" onPress={() => (shareable ? copyInviteLink(host, toast) : router.push("/server-settings/invites" as never))}>
        Invite a friend
      </Button>

      <View style={{ flexDirection: "row", gap: theme.space(2) }}>
        <Stat label="Members" value={String(all.length)} />
        {messages != null ? <Stat label="Messages" value={spaced(messages)} /> : null}
        <Stat label="Online" value={String(all.filter((m) => m.status && m.status !== "offline").length)} />
      </View>

      {cloud || storage ? (
        <Surface level="surface" bordered radius="lg" style={{ padding: theme.space(3), gap: theme.space(2) }}>
          <Label>Storage</Label>
          {limit ? <Meter value={used == null ? 0 : Math.min(100, (used / limit) * 100)} /> : null}
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: theme.color.text, fontSize: 14, fontWeight: "600" }}>{used == null ? "Not counted yet" : size(used)}</Text>
            {limit ? <Text style={{ color: theme.color.muted, fontSize: 13 }}>of {size(limit)}</Text> : null}
          </View>
        </Surface>
      ) : null}

      <View style={{ gap: theme.space(2) }}>
        <Label>Needs you</Label>
        {needs.length === 0 ? (
          <Text style={{ color: theme.color.muted, fontSize: 14 }}>Nothing needs you right now.</Text>
        ) : (
          needs.map((n) => <Row key={n.v} label={n.t} hint={n.v} onPress={notOnPhone} />)
        )}
      </View>

      <View style={{ gap: theme.space(2) }}>
        {sections.length === 0 ? (
          <Text style={{ color: theme.color.muted, fontSize: 14, lineHeight: 20 }}>
            Your role doesn't include any of the permissions these settings need.
          </Text>
        ) : (
          sections.map((s) => (
            <TourTarget key={s} id={`server-settings-${s}`}>
              <Row {...SECTION_META[s]} hint={s === "hosting" && !cloud ? "Storage" : SECTION_META[s].hint} onPress={() => openSection(s, visiblePages(s, info, !!cloud))} />
            </TourTarget>
          ))
        )}
        {info?.is_owner ? (
          <Pressable onPress={startOwnerTour} accessibilityRole="button" hitSlop={8} style={{ alignSelf: "flex-start", paddingVertical: theme.space(1) }}>
            <Text style={{ color: theme.color.accent, fontSize: 14, fontWeight: "600" }}>Show me around</Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

/** One tab holding several screens, like the desktop's rows: Roles, Moderation, Hosting. */
export function ServerSettingsSectionScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const section = (id in SECTION_META ? id : "roles") as AdminSection;
  const { state } = useServerConnection();
  const { server } = useShell();
  const cloud = useCloudUsage(server?.host);
  const info = state.status === "ready" ? state.details : undefined;
  return (
    <Screen title={SECTION_META[section].label}>
      <View style={{ gap: theme.space(2) }}>
        {visiblePages(section, info, !!cloud).map((p) => (
          <Row key={p.key} label={p.label} hint={p.hint} onPress={() => router.push(p.route as never)} />
        ))}
      </View>
    </Screen>
  );
}
