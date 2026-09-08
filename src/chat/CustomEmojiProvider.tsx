import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useServerConnection } from "../connection/ConnectionsProvider";
import { getServerHttpBase } from "../servers/address";
import { useShell } from "../shell/ShellContext";

const CustomEmojiContext = createContext<ReadonlyMap<string, string>>(new Map());

/**
 * The emoji this server has of its own, as name to picture. **One instance, not one per
 * message**, and **the list is HTTP, not the socket** — the event carries nothing.
 */
export function CustomEmojiProvider({ children }: { children?: ReactNode }) {
  const { socket, online } = useServerConnection();
  /* The address off the shell rather than the connection: `ConnectionState` carries
   * what the server said about itself, not where it was dialled. */
  const { server } = useShell();
  const host = server?.host ?? null;
  const [emojis, setEmojis] = useState<ReadonlyMap<string, string>>(new Map());

  useEffect(() => {
    if (!host || !online) {
      /* Cleared rather than kept: the map belongs to one server, and holding the last
       * one's would draw the wrong picture for a name that exists on both. */
      setEmojis(new Map());
      return;
    }

    let cancelled = false;

    const load = () => {
      fetch(`${getServerHttpBase(host)}/api/emojis`)
        .then((response) => (response.ok ? response.json() : []))
        .then((list: unknown) => {
          if (cancelled || !Array.isArray(list)) return;
          setEmojis(
            new Map(
              list
                .filter(
                  (entry): entry is { name: string; file_id: string } =>
                    typeof entry?.name === "string" && typeof entry?.file_id === "string",
                )
                .map((entry) => [
                  entry.name,
                  `${getServerHttpBase(host)}/api/emojis/img/${encodeURIComponent(entry.name)}`,
                ]),
            ),
          );
        })
        .catch(() => {
          /* A server with no emoji route, or one briefly unreachable. An empty map
           * draws every shortcode as its own text, which is the old behaviour. */
        });
    };

    load();
    socket?.on("server:emojis:updated", load);
    return () => {
      cancelled = true;
      socket?.off("server:emojis:updated", load);
    };
  }, [host, online, socket]);

  return <CustomEmojiContext.Provider value={emojis}>{children}</CustomEmojiContext.Provider>;
}

/**
 * Empty rather than throwing where there is no provider. A message can be drawn
 * outside a connection, and "this server has no custom emoji" is true there.
 */
export function useCustomEmojis(): ReadonlyMap<string, string> {
  return useContext(CustomEmojiContext);
}
