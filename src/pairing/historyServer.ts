import { chooseHistoryServer, openServerHistory, type HistoryFetch, type ServerAccess } from "@gryt/core";
import { fetch as expoFetch } from "expo/fetch";

import { readTokens } from "../connection/tokens";
import { getServerHttpBase } from "../servers/address";

/* A linked device's history waits on one of the user's own servers, never Gryt's relay (GRYT-2055). */

const access: ServerAccess = {
  base: (host) => getServerHttpBase(host),
  token: async (host) => (await readTokens(host))?.accessToken ?? null,
};

// expo/fetch, because the chunks are raw bytes and React Native's own fetch only sends strings reliably.
const historyFetch: HistoryFetch = (url, { body, ...init }) => expoFetch(url, { ...init, body: body?.slice().buffer });

export const chooseHistory = () => chooseHistoryServer(access, historyFetch);
export const openHistory = () => openServerHistory(access, historyFetch);
