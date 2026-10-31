import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect } from "react";

import { useServerConnection } from "../connection/ConnectionsProvider";
import { firstTextChannelId, rememberedChannelId } from "./firstChannel";
import { useShell } from "./ShellContext";
import { useTwoPane } from "./twoPane";

const KEY = "lastChannels";

let lastChannels: Record<string, string> = {};
let switching = false;

void AsyncStorage.getItem(KEY)
  .then((stored) => {
    if (stored) lastChannels = { ...(JSON.parse(stored) as Record<string, string>), ...lastChannels };
  })
  .catch(() => {});

export function rememberChannel(host: string, channelId: string): void {
  if (lastChannels[host] === channelId) return;
  lastChannels = { ...lastChannels, [host]: channelId };
  AsyncStorage.setItem(KEY, JSON.stringify(lastChannels)).catch(() => {});
}

export function lastChannelOn(host: string | undefined): string | null {
  return host ? (lastChannels[host] ?? null) : null;
}

/** For a person picking a server. Anything that opens a server to reach one thing just uses `setServer`. */
export function useSwitchServer(): (host: string) => void {
  const { server, setServer } = useShell();
  return (host) => {
    if (host === server?.host) return;
    switching = true;
    setServer(host);
  };
}

/** Draws nothing. Puts you back where you were on the server you just picked. */
export function ReturnToLastChannel() {
  const { server } = useShell();
  const { state } = useServerConnection();
  const twoPane = useTwoPane();

  const status = state.status;
  const channels = state.status === "ready" ? state.channels : null;
  const sidebar = state.status === "ready" ? state.sidebar : null;

  useEffect(() => {
    if (!switching || !channels || !sidebar) return;
    switching = false;
    const remembered = rememberedChannelId(lastChannelOn(server?.host), channels);
    const target = remembered ?? (twoPane ? firstTextChannelId({ status, channels, sidebar }) : null);
    if (!target) return;
    const href = { pathname: "/channel/[id]", params: { id: target } } as const;
    if (twoPane) router.replace(href);
    else router.push(href);
  }, [channels, sidebar, server?.host, status, twoPane]);

  return null;
}
