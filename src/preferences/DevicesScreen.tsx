import type { MlsOwnDevice } from "@gryt/core";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Chip, Divider, Surface, Text, useTheme, useToast } from "@gryt/ui-native";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { DevicesIcon } from "phosphor-react-native/src/icons/Devices";
import { TrashIcon } from "phosphor-react-native/src/icons/Trash";

import { useMlsSession } from "../mls/registry";
import { orderOwnDevices, ownDeviceAdded, ownDeviceLabel, removeOwnDeviceWarning } from "../mls/ownDevices";
import { ServerIcon } from "../servers/ServerIcon";
import { useServers } from "../servers/store";
import { useConfirm } from "../ui/actionSheet";

type Loaded = { kind: "loading" } | { kind: "failed" } | { kind: "devices"; devices: MlsOwnDevice[] };

/**
 * Your encrypted-DM devices on each server, and removing one you don't use anymore
 * (GRYT-1526). The desktop has the same under Settings, Security.
 */
export function DevicesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { servers } = useServers();

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <View
        style={{
          paddingTop: insets.top + theme.space(1),
          paddingBottom: theme.space(2),
          paddingHorizontal: theme.space(2),
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space(2),
          borderBottomWidth: 1,
          borderColor: theme.color.border,
          backgroundColor: theme.color.surface,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: theme.radius.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? theme.color.surfaceHover : theme.color.surfaceRaised,
          })}
        >
          <CaretLeftIcon size={20} color={theme.color.text} weight="bold" />
        </Pressable>
        <Text style={{ color: theme.color.text, fontSize: 18, fontWeight: "700" }}>Your devices</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: theme.space(4), gap: theme.space(5) }}>
        <Text style={{ color: theme.color.muted, fontSize: 13, lineHeight: 18 }}>
          Each app or browser you use for encrypted DMs is a device. Every server has its own list.
        </Text>
        {servers.length === 0 ? (
          <Text style={{ color: theme.color.muted, fontSize: 13 }}>No servers yet. Join one and it will show up here.</Text>
        ) : (
          servers.map((server) => <ServerDevices key={server.host} host={server.host} name={server.name} />)
        )}
      </ScrollView>
    </View>
  );
}

function ServerDevices({ host, name }: { host: string; name: string }) {
  const theme = useTheme();
  const session = useMlsSession(host);
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });

  const load = useCallback(() => {
    if (!session?.capability) return;
    session.ownDevices().then(
      (devices) => setLoaded({ kind: "devices", devices }),
      (e: unknown) => {
        console.warn("[MLS] Couldn't list devices for", host, e);
        setLoaded({ kind: "failed" });
      },
    );
  }, [host, session]);

  // Again after a device is added or removed anywhere.
  useEffect(() => {
    load();
    return session?.onChange((conversationId) => {
      if (conversationId === null) load();
    });
  }, [load, session]);

  const note = (text: string) => <Text style={{ color: theme.color.muted, fontSize: 13 }}>{text}</Text>;
  let body;
  if (!session) body = note("Connect to this server to see your devices there.");
  else if (!session.capability) body = note("This server doesn't have encrypted DMs.");
  else if (loaded.kind === "loading") body = note("Loading…");
  else if (loaded.kind === "failed") {
    body = (
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2) }}>
        {note("Couldn't load your devices here.")}
        <Button size="small" onPress={load}>
          Retry
        </Button>
      </View>
    );
  } else {
    const devices = orderOwnDevices(loaded.devices);
    body = (
      <Surface bordered radius="lg" style={{ paddingHorizontal: theme.space(3) }}>
        {devices.map((device, i) => (
          <View key={device.deviceId}>
            {i > 0 ? <Divider /> : null}
            <DeviceRow
              device={device}
              serverName={name}
              onRemove={() => session.removeOwnDevice(device.deviceId)}
              onRemoved={load}
            />
          </View>
        ))}
      </Surface>
    );
  }

  return (
    <View style={{ gap: theme.space(2) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3) }}>
        <ServerIcon host={host} name={name} size={32} />
        <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 16, fontWeight: "500", flex: 1 }}>
          {name}
        </Text>
      </View>
      {body}
    </View>
  );
}

function DeviceRow({
  device,
  serverName,
  onRemove,
  onRemoved,
}: {
  device: MlsOwnDevice;
  serverName: string;
  onRemove: () => Promise<void>;
  onRemoved: () => void;
}) {
  const theme = useTheme();
  const confirm = useConfirm();
  const toast = useToast();
  const [removing, setRemoving] = useState(false);
  const added = ownDeviceAdded(device);

  const remove = async () => {
    const ok = await confirm({
      title: "Remove device?",
      message: removeOwnDeviceWarning(device, serverName),
      confirm: "Remove",
    });
    if (!ok) return;
    setRemoving(true);
    try {
      await onRemove();
      toast.show({ title: "Device removed", severity: "success" });
    } catch (e) {
      toast.show({ title: e instanceof Error ? e.message : "Couldn't remove the device", severity: "error" });
    } finally {
      setRemoving(false);
      onRemoved();
    }
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(3), paddingVertical: theme.space(3) }}>
      <DevicesIcon size={22} color={theme.color.text} weight="fill" />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space(2) }}>
          <Text numberOfLines={1} style={{ color: theme.color.text, fontSize: 16, fontWeight: "500", flexShrink: 1 }}>
            {ownDeviceLabel(device)}
          </Text>
          {device.thisDevice ? <Chip label="This device" tone="neutral" /> : null}
        </View>
        {added ? <Text style={{ color: theme.color.muted, fontSize: 13 }}>{added}</Text> : null}
      </View>
      {device.thisDevice ? null : (
        <Pressable
          onPress={() => void remove()}
          disabled={removing}
          accessibilityRole="button"
          accessibilityLabel="Remove device"
          hitSlop={8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: theme.radius.full,
            alignItems: "center",
            justifyContent: "center",
            opacity: removing ? 0.5 : 1,
            backgroundColor: pressed ? theme.color.surfaceHover : "transparent",
          })}
        >
          <TrashIcon size={20} color={theme.color.muted} weight="fill" />
        </Pressable>
      )}
    </View>
  );
}
