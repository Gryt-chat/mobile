import { useEffect } from "react";
import type { Socket } from "socket.io-client";

import { parseFriendList } from "./friendList";
import { firstNoticeOf, forgetServerFriendList, registerFriendEmitter, setServerFriendList } from "./friendsStore";

/**
 * One server's friends into the store, and the store's buttons out to that server
 * (GRYT-1471). A server from before friends never answers, and shows nothing.
 */
export function useFriendsSync({
  host,
  serverName,
  socket,
  online,
  getAccessToken,
  notify,
}: {
  host: string;
  serverName: string;
  socket: Socket | null;
  online: boolean;
  getAccessToken: () => Promise<string | null>;
  notify: (text: string) => void;
}): void {
  useEffect(() => {
    if (!socket || !online) return;

    const onList = (payload: unknown) => {
      const list = parseFriendList(payload);
      if (list) setServerFriendList(host, list);
    };
    const onIncoming = (payload: { serverUserId?: unknown; nickname?: unknown }) => {
      if (typeof payload?.serverUserId !== "string" || !firstNoticeOf(host, payload.serverUserId)) return;
      const name = typeof payload.nickname === "string" && payload.nickname ? payload.nickname : "Somebody";
      notify(`${name} sent you a friend request on ${serverName}.`);
    };
    const onError = (payload: { message?: unknown }) => {
      if (typeof payload?.message === "string") notify(payload.message);
    };

    socket.on("friend:list", onList);
    socket.on("friend:request:incoming", onIncoming);
    socket.on("friend:error", onError);
    registerFriendEmitter(host, (event, serverUserId) => {
      void getAccessToken().then((accessToken) => {
        if (accessToken) socket.emit(event, { accessToken, serverUserId });
      });
    });
    void getAccessToken().then((accessToken) => {
      if (accessToken) socket.emit("friend:list", { accessToken });
    });

    return () => {
      socket.off("friend:list", onList);
      socket.off("friend:request:incoming", onIncoming);
      socket.off("friend:error", onError);
      registerFriendEmitter(host, null);
    };
    // `notify` is new on every render, and only its latest words matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, serverName, socket, online, getAccessToken]);

  // The list is the server's claim for this session, so a server that's gone takes it along.
  useEffect(() => () => forgetServerFriendList(host), [host]);
}
